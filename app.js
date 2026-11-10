'use strict';

// Calculadora Elétrica RD PWA 1.1
// Dados de ampacidade: tabelas 36 e 37 da ABNT NBR 5410:2004.
const SECTIONS=[1.5,2.5,4,6,10,16,25,35,50,70,95,120,150,185,240];
const BREAKERS=[6,10,16,20,25,32,40,50,63,80,100,125,160,200,250,315,400];
const CAPACITY={
  cu_pvc:[[17.5,15.5,16.5,15,19.5,17.5],[24,21,23,20,27,24],[32,28,30,27,36,32],[41,36,38,34,46,41],[57,50,52,46,63,57],[76,68,69,62,85,76],[101,89,90,80,112,96],[125,110,111,99,138,119],[151,134,133,118,168,144],[192,171,168,149,213,184],[232,207,201,179,258,223],[269,239,232,206,299,259],[309,275,265,236,344,299],[353,314,300,268,392,341],[415,370,351,313,461,403]],
  cu_xlpe:[[23,20,22,19.5,24,22],[31,28,30,26,33,30],[42,37,40,35,45,40],[54,48,51,44,58,52],[75,66,69,60,80,71],[100,88,91,80,107,96],[133,117,119,105,138,119],[164,144,146,128,171,147],[198,175,175,154,209,179],[253,222,221,194,269,229],[306,269,265,233,328,278],[354,312,305,268,382,322],[407,358,349,307,441,371],[464,408,395,348,506,424],[546,481,462,407,599,500]],
  al_pvc:[null,null,null,null,null,[60,53,54,48,66,59],[79,70,71,62,83,73],[97,86,86,77,103,90],[118,104,104,92,125,110],[150,133,131,116,160,140],[181,161,157,139,195,170],[210,186,181,160,226,197],[241,214,206,183,261,227],[275,245,234,208,298,259],[324,288,274,243,352,305]],
  al_xlpe:[null,null,null,null,null,[79,71,72,64,84,76],[105,93,94,84,101,90],[130,116,115,103,126,112],[157,140,138,124,154,136],[200,179,175,156,198,174],[242,217,210,188,241,211],[281,251,242,216,280,245],[323,289,277,248,324,283],[368,330,314,281,371,323],[433,389,368,329,439,382]]
};
const TEMP={pvc:{20:1.12,25:1.06,30:1,35:.94,40:.87,45:.79,50:.71,55:.61,60:.50},xlpe:{20:1.08,25:1.04,30:1,35:.96,40:.91,45:.87,50:.82,55:.76,60:.71}};
const GROUP={bundle:{1:1,2:.8,3:.70,4:.65,5:.60,6:.57,7:.54,8:.52,9:.50,12:.45,16:.41,20:.38},wall:{1:1,2:.85,3:.79,4:.75,5:.73,6:.72,7:.72,8:.71,9:.70}};
const $=id=>document.getElementById(id);
const fieldIds=['projectName','circuitName','power','voltage','pf','length','material','insulation','section','method','ambient','group','arrangement','limit','breaker'];
const defaultValues={projectName:'Meu projeto',circuitName:'Circuito 1',power:'5500',voltage:'220',pf:'0.92',length:'30',material:'cu',insulation:'pvc',section:'6',method:'B1',ambient:'30',group:'1',arrangement:'bundle',limit:'4',breaker:'32',system:'two'};
let currentData=null,memory='',segments=[];

const fr=(v,n=2)=>Number.isFinite(v)?v.toLocaleString('pt-BR',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const escapeHTML=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const sizesFor=material=>SECTIONS.filter(n=>material==='cu'||n>=16);
const sizeOptions=(material,selected)=>sizesFor(material).map(n=>`<option value="${n}"${String(n)===String(selected)?' selected':''}>${String(n).replace('.',',')} mm²</option>`).join('');
const selectOptions=(items,selected)=>items.map(([value,label])=>`<option value="${value}"${String(value)===String(selected)?' selected':''}>${label}</option>`).join('');

function optionSize(){
  const material=$('material').value,previous=$('section').value||defaultValues.section;
  $('section').innerHTML=sizeOptions(material,previous);
  if(!sizesFor(material).some(n=>String(n)===String(previous)))$('section').value=material==='al'?'16':'6';
}

function optionArrangement(){
  const method=$('method').value,arr=$('arrangement'),wall=arr.querySelector('option[value="wall"]');
  wall.disabled=method!=='C';
  if(wall.disabled&&arr.value==='wall')arr.value='bundle';
  const prior=$('group').value;
  Array.from($('group').options).forEach(o=>o.disabled=arr.value==='wall'&&Number(o.value)>9);
  if(arr.value==='wall'&&Number(prior)>9)$('group').value='9';
  $('arrHelp').textContent=arr.value==='wall'?'Fator válido apenas para camada única conforme tab. 42, ref. 2. Não se aplica a bandeja perfurada ou leito.':'Feixe/conduto fechado (tab. 42, ref. 1). Para método C, selecione camada única quando aplicável.';
}

function normalizeSegment(value={},index=0){
  const material=value.material==='al'?'al':'cu';
  const validSizes=sizesFor(material);
  const section=validSizes.includes(Number(value.section))?String(value.section):String(material==='al'?16:6);
  const method=['B1','B2','C'].includes(value.method)?value.method:'B1';
  const arrangement=method==='C'&&value.arrangement==='wall'?'wall':'bundle';
  let group=String(value.group||'1');
  if(!GROUP[arrangement][group])group='1';
  return {name:String(value.name||`Trecho ${index+1}`).slice(0,80),length:String(value.length??10),material,insulation:value.insulation==='xlpe'?'xlpe':'pvc',section,method,ambient:String(value.ambient||'30'),group,arrangement};
}

function renderSegments(){
  const host=$('segments');
  if(!segments.length){host.innerHTML='<div class="hint">Nenhum trecho anterior. A queda calculada corresponde somente ao trecho final.</div>';return;}
  const methods=[['B1','B1 — Condutores em eletroduto'],['B2','B2 — Cabo multipolar em eletroduto'],['C','C — Cabos fixados diretamente']];
  const ambients=[20,25,30,35,40,45,50,55,60].map(n=>[n,`${n} °C`]);
  const groups=[[1,'1 circuito'],[2,'2 circuitos'],[3,'3 circuitos'],[4,'4 circuitos'],[5,'5 circuitos'],[6,'6 circuitos'],[7,'7 circuitos'],[8,'8 circuitos'],[9,'9 a 11 circuitos'],[12,'12 a 15 circuitos'],[16,'16 a 19 circuitos'],[20,'20 ou mais circuitos']];
  host.innerHTML=segments.map((s,i)=>`<div class="segment-row" data-segment="${i}"><div class="segment-head"><strong>${escapeHTML(s.name||`Trecho ${i+1}`)}</strong><button class="btn" type="button" data-remove-segment="${i}">Remover</button></div><div class="segment-fields"><div class="field wide"><label>Identificação</label><input type="text" maxlength="80" value="${escapeHTML(s.name)}" data-segment-field="name"></div><div class="field"><label>Comprimento de ida (m)</label><input type="number" min="0" step="any" value="${escapeHTML(s.length)}" data-segment-field="length"></div><div class="field"><label>Material</label><select data-segment-field="material">${selectOptions([['cu','Cobre'],['al','Alumínio']],s.material)}</select></div><div class="field"><label>Isolação</label><select data-segment-field="insulation">${selectOptions([['pvc','PVC — 70 °C'],['xlpe','EPR / XLPE — 90 °C']],s.insulation)}</select></div><div class="field"><label>Seção</label><select data-segment-field="section">${sizeOptions(s.material,s.section)}</select></div><div class="field"><label>Método</label><select data-segment-field="method">${selectOptions(methods,s.method)}</select></div><div class="field"><label>Temperatura</label><select data-segment-field="ambient">${selectOptions(ambients,s.ambient)}</select></div><div class="field"><label>Agrupamento</label><select data-segment-field="group">${groups.map(([v,l])=>`<option value="${v}"${String(v)===String(s.group)?' selected':''}${s.arrangement==='wall'&&Number(v)>9?' disabled':''}>${l}</option>`).join('')}</select></div><div class="field wide"><label>Disposição</label><select data-segment-field="arrangement">${selectOptions([['bundle','Feixe / conduto fechado'],['wall','Camada única na parede / piso / bandeja não perfurada']],s.arrangement).replace('value="wall"','value="wall"'+(s.method!=='C'?' disabled':''))}</select></div></div></div>`).join('');
}

function calculateSegment(config,ib,fp,u,system){
  const length=Number(config.length),section=Number(config.section),errors=[];
  if(!Number.isFinite(length)||length<0)errors.push('comprimento inválido');
  if(!Number.isFinite(section)||section<=0)errors.push('seção inválida');
  if(config.arrangement==='wall'&&config.method!=='C')errors.push('camada única requer método C');
  const cols=({B1:0,B2:2,C:4}[config.method])+(system==='three'?1:0);
  const iz0=CAPACITY[config.material+'_'+config.insulation]?.[SECTIONS.indexOf(section)]?.[cols];
  const ft=TEMP[config.insulation]?.[config.ambient],fg=GROUP[config.arrangement]?.[config.group];
  if(!Number.isFinite(iz0)||!Number.isFinite(ft)||!Number.isFinite(fg))errors.push('combinação sem valor tabelado');
  if(errors.length)return {errors};
  const iz=iz0*ft*fg,q=system==='three'?Math.sqrt(3):2;
  const rho=config.material==='cu'?.01724:.02826,alpha=config.material==='cu'?.00393:.00403,temperature=config.insulation==='pvc'?70:90;
  const rKm=1000*rho*(1+alpha*(temperature-20))/section,xKm=.08,sinPhi=Math.sqrt(Math.max(0,1-fp*fp));
  const delta=q*ib*(rKm*fp+xKm*sinPhi)*length/1000;
  return {errors:[],length,section,iz0,ft,fg,iz,rKm,xKm,temperature,delta,ampOK:ib<=iz};
}

function snapshotValues(){
  const values=Object.fromEntries(fieldIds.map(id=>[id,$(id).value]));
  values.system=document.querySelector('input[name="system"]:checked').value;
  return values;
}

function collect(){
  const v=snapshotValues();
  const p=Number(v.power),u=Number(v.voltage),fp=Number(v.pf),length=Number(v.length),section=Number(v.section),breaker=Number(v.breaker),errors=[];
  if(!Number.isFinite(p)||p<=0)errors.push('Informe uma potência positiva.');
  if(!Number.isFinite(u)||u<=0||u>1000)errors.push('A tensão deve estar acima de 0 V e até 1.000 V.');
  if(!Number.isFinite(fp)||fp<=0||fp>1)errors.push('O fator de potência deve ser maior que 0 e no máximo 1.');
  if(!Number.isFinite(length)||length<0)errors.push('O comprimento final não pode ser negativo.');
  if(!(section>0))errors.push('Selecione uma seção válida.');
  if(!Number.isFinite(breaker)||breaker<=0)errors.push('Selecione um disjuntor válido.');
  if(errors.length)return {errors};
  const k=v.system==='three'?Math.sqrt(3):1,ib=p/(k*u*fp);
  const primary=calculateSegment(v,ib,fp,u,v.system);
  if(primary.errors.length)return {errors:['Trecho final: '+primary.errors.join(', ')+'.']};
  const upstream=segments.map((segment,index)=>({config:segment,result:calculateSegment(segment,ib,fp,u,v.system),index}));
  const segmentErrors=upstream.filter(x=>x.result.errors.length).map(x=>`${x.config.name||`Trecho ${x.index+1}`}: ${x.result.errors.join(', ')}.`);
  if(segmentErrors.length)return {errors:segmentErrors};
  const upstreamDelta=upstream.reduce((sum,x)=>sum+x.result.delta,0),delta=primary.delta+upstreamDelta,dropPercent=100*delta/u;
  const allResults=[primary,...upstream.map(x=>x.result)],minIz=Math.min(...allResults.map(x=>x.iz)),ampOK=allResults.every(x=>x.ampOK),dropOK=dropPercent<=Number(v.limit),breakerOK=ib<=breaker&&breaker<=minIz;
  let recommendedSection=null;
  for(const candidate of sizesFor(v.material)){
    const trial=calculateSegment({...v,section:String(candidate)},ib,fp,u,v.system);
    if(!trial.errors.length&&trial.ampOK&&100*(trial.delta+upstreamDelta)/u<=Number(v.limit)){recommendedSection=candidate;break;}
  }
  const recommendedBreaker=BREAKERS.find(value=>value>=ib&&value<=minIz)||null;
  return {v,p,u,fp,ib,breaker,primary,upstream,upstreamDelta,delta,dropPercent,terminalDropPercent:100*primary.delta/u,loadVoltage:u-delta,minIz,ratio:100*ib/minIz,ampOK,dropOK,breakerOK,recommendedSection,recommendedBreaker,errors:[]};
}

function status(stateId,valid,text){const el=$(stateId);el.className='state '+(valid?'good':'bad');el.innerHTML='<span class="dot"></span><span></span>';el.lastChild.textContent=text;}
function bar(barId,ratio,good){const el=$(barId);el.style.width=Math.max(0,Math.min(100,ratio))+'%';el.className='fill'+(good?'':' bad');}

function display(){
  currentData=collect();const d=currentData;
  if(d.errors.length){
    $('errors').textContent=d.errors.join(' ');$('errors').classList.add('show');
    ['ib','iz','dropPct','dropVolt','loadVoltage','ampRatio','dropRatio','breakerRatio','iz0Cell','ftCell','fgCell','resCell','terminalDropCell','upstreamDropCell','marginCell','recSection','recBreaker'].forEach(id=>$(id).textContent='—');
    ['ampBar','dropBar'].forEach(id=>$(id).style.width='0');
    ['ampState','dropState','breakerState'].forEach(id=>{$(id).className='state neutral';$(id).textContent='Parâmetros inválidos';});
    $('summary').className='summary bad';$('summary').innerHTML='<strong>Não foi possível calcular</strong><span>Corrija os parâmetros indicados.</span>';
    $('applyRecommendation').disabled=true;memory='';$('copyBtn').disabled=$('printBtn').disabled=$('printBtn2').disabled=$('memoryBtn').disabled=true;return;
  }
  $('errors').classList.remove('show');$('copyBtn').disabled=$('printBtn').disabled=$('printBtn2').disabled=$('memoryBtn').disabled=false;
  $('ib').textContent=fr(d.ib)+' A';$('iz').textContent=fr(d.primary.iz)+' A';$('dropPct').textContent=fr(d.dropPercent)+'%';$('dropVolt').textContent=fr(d.delta)+' V acumulados';$('loadVoltage').textContent=fr(d.loadVoltage)+' V';
  $('ampRatio').textContent=fr(d.ratio,1)+'%';$('dropRatio').textContent=fr(d.dropPercent)+'% / '+d.v.limit+'%';$('breakerRatio').textContent=`${fr(d.ib,1)} ≤ ${fr(d.breaker,0)} ≤ ${fr(d.minIz,1)} A`;
  bar('ampBar',d.ratio,d.ampOK);bar('dropBar',d.dropPercent/Number(d.v.limit)*100,d.dropOK);
  status('ampState',d.ampOK,d.ampOK?'Todos os trechos possuem ampacidade suficiente.':'Ao menos um trecho possui ampacidade inferior à corrente da carga.');
  status('dropState',d.dropOK,d.dropOK?'Queda acumulada dentro do limite configurado.':'Queda acumulada superior ao limite configurado.');
  status('breakerState',d.breakerOK,d.breakerOK?'Relação preliminar Ib ≤ In ≤ Iz atendida em todos os trechos.':'O disjuntor selecionado não atende à relação preliminar Ib ≤ In ≤ Iz.');
  $('iz0Cell').textContent=fr(d.primary.iz0)+' A';$('ftCell').textContent=fr(d.primary.ft);$('fgCell').textContent=fr(d.primary.fg);$('resCell').textContent=fr(d.primary.rKm,4)+' Ω/km';$('terminalDropCell').textContent=fr(d.primary.delta)+' V ('+fr(d.terminalDropPercent)+'%)';$('upstreamDropCell').textContent=fr(d.upstreamDelta)+' V';$('marginCell').textContent=fr(d.minIz-d.ib)+' A';
  $('recSection').textContent=d.recommendedSection?String(d.recommendedSection).replace('.',',')+' mm²':'Sem solução';$('applyRecommendation').disabled=!d.recommendedSection||Number(d.v.section)===d.recommendedSection;
  $('recBreaker').textContent=d.recommendedBreaker?d.recommendedBreaker+' A':'Sem solução';
  $('recNote').textContent=d.recommendedBreaker?'Menor valor padronizado que atende Ib e a menor Iz calculada.':'Não há disjuntor da lista que atenda à corrente e à menor ampacidade.';
  const good=d.ampOK&&d.dropOK&&d.breakerOK;
  $('summary').className='summary'+(good?'':' bad');$('summary').innerHTML='<strong>'+(good?'Verificações preliminares atendidas':'Uma ou mais verificações não atendidas')+'</strong><span>'+(good?'Ampacidade, queda acumulada e relação Ib ≤ In ≤ Iz atendem à simulação.':'Revise seções, proteção, instalação, agrupamento ou trajeto antes de utilizar a solução.')+'</span>';
  if(d.loadVoltage<0)$('summary').lastChild.textContent+=' A queda calculada supera a tensão nominal: aplicação fora do intervalo útil deste modelo.';
  memory=makeMemory(d);
  try{localStorage.setItem('calc_eletrica_offline_v11',JSON.stringify({values:d.v,segments}))}catch(e){}
}

function namedGroup(value){return ({'9':'9 a 11','12':'12 a 15','16':'16 a 19','20':'20 ou mais'})[value]||value;}
function makeRows(d){return [
  ['Projeto / obra',d.v.projectName||'Não informado'],['Circuito',d.v.circuitName||'Não informado'],['Configuração',d.v.system==='three'?'Trifásico equilibrado':'Dois condutores (F+N / F+F)'],['Potência ativa',fr(d.p)+' W'],['Tensão nominal',fr(d.u)+' V'],['Fator de potência',fr(d.fp)],['Corrente da carga (Ib)',fr(d.ib,3)+' A'],['Trecho final — comprimento',fr(d.primary.length)+' m'],['Trecho final — material',d.v.material==='cu'?'Cobre':'Alumínio'],['Trecho final — isolação',d.v.insulation==='pvc'?'PVC 70 °C':'EPR / XLPE 90 °C'],['Trecho final — seção',fr(d.primary.section)+' mm²'],['Trecho final — método',d.v.method],['Trecho final — temperatura',d.v.ambient+' °C'],['Trecho final — agrupamento',namedGroup(d.v.group)],['Capacidade tabelada final (Iz₀)',fr(d.primary.iz0,3)+' A'],['Capacidade corrigida final (Iz)',fr(d.primary.iz,3)+' A'],['Menor Iz do percurso',fr(d.minIz,3)+' A'],['Disjuntor selecionado (In)',fr(d.breaker,0)+' A'],['Coordenação Ib ≤ In ≤ Iz',d.breakerOK?'ATENDIDA':'NÃO ATENDIDA'],['Queda no trecho final',fr(d.primary.delta,3)+' V / '+fr(d.terminalDropPercent,3)+'%'],['Queda nos trechos anteriores',fr(d.upstreamDelta,3)+' V'],['Queda acumulada',fr(d.delta,3)+' V / '+fr(d.dropPercent,3)+'%'],['Tensão estimada na carga',fr(d.loadVoltage,3)+' V'],['Limite configurado',d.v.limit+'%'],['Seção automática sugerida',d.recommendedSection?fr(d.recommendedSection)+' mm²':'Sem solução'],['Disjuntor sugerido',d.recommendedBreaker?d.recommendedBreaker+' A':'Sem solução'],['Ampacidade em todos os trechos',d.ampOK?'ATENDIDA':'NÃO ATENDIDA'],['Queda acumulada ≤ limite',d.dropOK?'ATENDIDA':'NÃO ATENDIDA']];}
function segmentRows(d){return d.upstream.map(({config,result},index)=>[config.name||`Trecho ${index+1}`,`${fr(result.length)} m • ${config.material==='cu'?'Cu':'Al'} • ${fr(result.section)} mm² • ${config.method} • Iz ${fr(result.iz)} A • ΔU ${fr(result.delta)} V • ${result.ampOK?'OK':'REVISAR'}`]);}
function makeMemory(d){const lines=['MEMÓRIA DE CÁLCULO ELÉTRICO','Calculadora Elétrica RD — PWA 1.1','Emissão: '+new Date().toLocaleString('pt-BR'),'','DADOS E RESULTADOS',...makeRows(d).map(([k,v])=>k+': '+v)];if(d.upstream.length)lines.push('','TRECHOS ANTERIORES',...segmentRows(d).map(([k,v])=>k+': '+v));lines.push('','FÓRMULAS','Ib = P / (k · U · cosφ), k=1 (dois condutores) ou √3 (trifásico).','Iz = Iz₀ · Ft · Fg.','ΔU total = soma das quedas de todos os trechos.','Verificação preliminar da proteção: Ib ≤ In ≤ menor Iz do percurso.','','PREMISSAS E LIMITAÇÕES','ABNT NBR 5410:2004, tabelas 33, 36, 37, 40 e 42.','A reatância X foi fixada em 0,08 Ω/km, valor estimativo.','A recomendação automática não verifica seção mínima, curto-circuito, poder de interrupção, seletividade, harmônicas, neutro ou dados específicos do fabricante.','A avaliação não substitui dimensionamento técnico completo.');return lines.join('\n');}

function preparePrint(){
  if(!currentData||currentData.errors.length)return;
  const d=currentData,rows=makeRows(d),segmentsHTML=d.upstream.length?'<h2>Trechos anteriores</h2><table>'+segmentRows(d).map(([a,b])=>'<tr><td>'+escapeHTML(a)+'</td><td>'+escapeHTML(b)+'</td></tr>').join('')+'</table>':'';
  $('printDate').textContent=new Date().toLocaleString('pt-BR');
  $('printDetails').innerHTML='<h2>'+escapeHTML(d.v.projectName||'Projeto')+' — '+escapeHTML(d.v.circuitName||'Circuito')+'</h2><table>'+rows.map(([a,b])=>'<tr><td>'+escapeHTML(a)+'</td><td>'+escapeHTML(b)+'</td></tr>').join('')+'</table>'+segmentsHTML+'<h2>Equações consideradas</h2><p>Ib = P / (k · U · cosφ); Iz = Iz₀ · Ft · Fg; ΔU total = soma das quedas dos trechos; proteção preliminar: Ib ≤ In ≤ menor Iz.</p>';
}
function printDoc(){preparePrint();window.print();}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),2400);}
async function copyMemory(){if(!memory)return;try{await navigator.clipboard.writeText(memory);toast('Memória copiada para a área de transferência.');}catch(e){const t=document.createElement('textarea');t.value=memory;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();const success=document.execCommand('copy');document.body.removeChild(t);toast(success?'Memória copiada.':'Cópia automática indisponível.');}}
function openMemory(){$('memoryText').textContent=memory;$('modalBg').classList.add('open');$('closeModal').focus();}
function closeMemory(){$('modalBg').classList.remove('open');$('memoryBtn').focus();}

function applyValues(values){
  const v={...defaultValues,...(values||{})};
  for(const id of fieldIds){if(id==='section')continue;const el=$(id);if(!el||v[id]===undefined)continue;if(el.tagName==='SELECT'){if(Array.from(el.options).some(o=>o.value===String(v[id])))el.value=String(v[id]);}else el.value=String(v[id]);}
  optionSize();if(Array.from($('section').options).some(o=>o.value===String(v.section)))$('section').value=String(v.section);
  document.querySelector(`input[name="system"][value="${v.system==='three'?'three':'two'}"]`).checked=true;optionArrangement();
}
function reset(){segments=[];applyValues(defaultValues);renderSegments();display();toast('Parâmetros restaurados.');}

function getProjects(){try{const value=JSON.parse(localStorage.getItem('calc_eletrica_projects_v11')||'[]');return Array.isArray(value)?value:[];}catch(e){return[];}}
function setProjects(items){localStorage.setItem('calc_eletrica_projects_v11',JSON.stringify(items));}
function saveProject(){
  const values=snapshotValues(),project=(values.projectName||'Meu projeto').trim(),circuit=(values.circuitName||'Circuito 1').trim(),items=getProjects(),key=(project+'\n'+circuit).toLocaleLowerCase('pt-BR');
  const existing=items.findIndex(item=>(item.project+'\n'+item.circuit).toLocaleLowerCase('pt-BR')===key);
  const record={id:existing>=0?items[existing].id:(crypto.randomUUID?.()||String(Date.now())),project,circuit,savedAt:new Date().toISOString(),values:{...values,projectName:project,circuitName:circuit},segments:segments.map(s=>({...s}))};
  if(existing>=0)items[existing]=record;else items.unshift(record);setProjects(items);renderSavedProjects();toast(existing>=0?'Circuito atualizado.':'Circuito salvo no dispositivo.');
}
function renderSavedProjects(){
  const host=$('savedList'),items=getProjects().sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));host.replaceChildren();
  if(!items.length){const empty=document.createElement('div');empty.className='saved-empty';empty.textContent='Nenhum circuito salvo neste dispositivo.';host.appendChild(empty);return;}
  items.forEach(item=>{const row=document.createElement('div');row.className='saved-item';const info=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small'),actions=document.createElement('div');title.textContent=item.project+' — '+item.circuit;meta.textContent='Salvo em '+new Date(item.savedAt).toLocaleString('pt-BR')+' • '+(item.segments?.length||0)+' trecho(s) anterior(es)';info.append(title,meta);actions.className='actions';const load=document.createElement('button'),remove=document.createElement('button');load.type=remove.type='button';load.className='btn primary';remove.className='btn';load.textContent='Abrir';remove.textContent='Excluir';load.addEventListener('click',()=>loadProject(item.id));remove.addEventListener('click',()=>deleteProject(item.id));actions.append(load,remove);row.append(info,actions);host.appendChild(row);});
}
function loadProject(id){const item=getProjects().find(value=>value.id===id);if(!item)return;segments=(item.segments||[]).map(normalizeSegment);applyValues(item.values);renderSegments();display();closeProjects();toast('Circuito carregado.');}
function deleteProject(id){const item=getProjects().find(value=>value.id===id);if(!item||!confirm(`Excluir ${item.project} — ${item.circuit} deste dispositivo?`))return;setProjects(getProjects().filter(value=>value.id!==id));renderSavedProjects();toast('Circuito excluído.');}
function openProjects(){renderSavedProjects();$('projectsModal').classList.add('open');$('projectsModal').setAttribute('aria-hidden','false');$('closeProjects').focus();}
function closeProjects(){$('projectsModal').classList.remove('open');$('projectsModal').setAttribute('aria-hidden','true');$('projectsBtn').focus();}

$('material').addEventListener('change',()=>{optionSize();display();});$('method').addEventListener('change',()=>{optionArrangement();display();});$('arrangement').addEventListener('change',()=>{optionArrangement();display();});
document.querySelectorAll('#form input:not([name="system"]),#form select').forEach(el=>{if(['material','method','arrangement'].includes(el.id))return;el.addEventListener('input',display);el.addEventListener('change',display);});
document.querySelectorAll('input[name="system"]').forEach(el=>el.addEventListener('change',()=>{if(el.checked){const voltage=Number($('voltage').value);if(el.value==='three'&&voltage===220)$('voltage').value='380';if(el.value==='two'&&voltage===380)$('voltage').value='220';display();}}));
$('segments').addEventListener('input',event=>{const field=event.target.dataset.segmentField;if(!field)return;const row=event.target.closest('[data-segment]'),index=Number(row.dataset.segment);segments[index][field]=event.target.value;if(field==='name')row.querySelector('.segment-head strong').textContent=event.target.value||`Trecho ${index+1}`;display();});
$('segments').addEventListener('change',event=>{const field=event.target.dataset.segmentField;if(!field)return;const index=Number(event.target.closest('[data-segment]').dataset.segment),segment=segments[index];segment[field]=event.target.value;if(field==='material'&&!sizesFor(segment.material).includes(Number(segment.section)))segment.section=segment.material==='al'?'16':'6';if(field==='method'&&segment.method!=='C')segment.arrangement='bundle';if(field==='arrangement'&&segment.arrangement==='wall'&&Number(segment.group)>9)segment.group='9';segments[index]=normalizeSegment(segment,index);renderSegments();display();});
$('segments').addEventListener('click',event=>{const button=event.target.closest('[data-remove-segment]');if(!button)return;segments.splice(Number(button.dataset.removeSegment),1);renderSegments();display();});
$('addSegmentBtn').addEventListener('click',()=>{segments.push(normalizeSegment({name:`Alimentador ${segments.length+1}`,length:'10',material:$('material').value,insulation:$('insulation').value,section:$('section').value,method:$('method').value,ambient:$('ambient').value,group:$('group').value,arrangement:$('arrangement').value},segments.length));renderSegments();display();});
$('applyRecommendation').addEventListener('click',()=>{if(!currentData?.recommendedSection)return;$('section').value=String(currentData.recommendedSection);display();toast('Seção recomendada aplicada.');});
$('resetBtn').addEventListener('click',reset);$('saveBtn').addEventListener('click',saveProject);$('projectsBtn').addEventListener('click',openProjects);$('closeProjects').addEventListener('click',closeProjects);$('saveFromModal').addEventListener('click',()=>{saveProject();renderSavedProjects();});$('projectsModal').addEventListener('click',event=>{if(event.target===$('projectsModal'))closeProjects();});
$('printBtn').addEventListener('click',printDoc);$('printBtn2').addEventListener('click',printDoc);$('copyBtn').addEventListener('click',copyMemory);$('memoryBtn').addEventListener('click',openMemory);$('closeModal').addEventListener('click',closeMemory);$('modalCopy').addEventListener('click',copyMemory);$('modalPrint').addEventListener('click',printDoc);$('modalBg').addEventListener('click',event=>{if(event.target===$('modalBg'))closeMemory();});document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if($('modalBg').classList.contains('open'))closeMemory();if($('projectsModal').classList.contains('open'))closeProjects();});

let persisted=null;try{persisted=JSON.parse(localStorage.getItem('calc_eletrica_offline_v11')||'null');}catch(e){}
if(persisted?.values){segments=(persisted.segments||[]).map(normalizeSegment);applyValues(persisted.values);}else{let legacy=null;try{legacy=JSON.parse(localStorage.getItem('calc_eletrica_offline_v1')||'null');}catch(e){}applyValues(legacy&&typeof legacy==='object'?legacy:defaultValues);}
renderSegments();display();

// Instalação e atualização do PWA.
(()=>{
  const button=$('installBtn'),modal=$('installModal'),close=$('closeInstall'),done=$('installDone'),promptButton=$('installNow'),state=$('installStatus'),networkStatus=$('connectionStatus');
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||!!window.navigator.standalone;let installEvent=null,previousFocus=null;
  function updateNet(){networkStatus.textContent=navigator.onLine?'Conectividade: online':'Conectividade: offline';}
  function updateState(){if(standalone()){button.textContent='✓ Aplicativo instalado';state.textContent='Este aplicativo está aberto em modo instalado.';promptButton.hidden=true;}else if(location.protocol==='file:'){state.textContent='A instalação PWA requer publicação em HTTPS.';promptButton.hidden=true;}else if(!window.isSecureContext){state.textContent='Para instalar, acesse a calculadora por HTTPS.';promptButton.hidden=true;}else if(installEvent){state.textContent='O navegador disponibilizou instalação direta.';promptButton.hidden=false;}else{state.textContent='Use a opção de instalação no menu do navegador ou siga as instruções do dispositivo.';promptButton.hidden=true;}}
  function openInstall(){previousFocus=document.activeElement;updateState();modal.classList.add('open');modal.setAttribute('aria-hidden','false');close.focus();}
  function closeInstall(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');(previousFocus||button).focus();}
  button.addEventListener('click',openInstall);close.addEventListener('click',closeInstall);done.addEventListener('click',closeInstall);modal.addEventListener('click',event=>{if(event.target===modal)closeInstall();});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;updateState();});promptButton.addEventListener('click',async()=>{if(!installEvent)return;const pending=installEvent;installEvent=null;promptButton.hidden=true;pending.prompt();try{await pending.userChoice;}catch(e){}updateState();});window.addEventListener('appinstalled',()=>{installEvent=null;updateState();closeInstall();});window.addEventListener('online',updateNet);window.addEventListener('offline',updateNet);updateNet();updateState();
  if('serviceWorker'in navigator&&window.isSecureContext&&location.protocol!=='file:'){
    let refreshing=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(refreshing)return;refreshing=true;window.location.reload();});
    window.addEventListener('load',async()=>{try{const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});await registration.update();}catch(error){console.warn('Cache offline não disponível neste navegador:',error);}});
  }
})();
