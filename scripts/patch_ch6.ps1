$file = "d:\Healthcare\Merged-Healthcare-AI\frontend\src\HealthGuardPrototype.jsx"
$content = Get-Content $file -Raw

$startMarker = '            {/* CHAPTER 6: ICU INTELLIGENCE COMMAND CENTER */}'
$endMarker   = '            )}'

# Find start index
$startIdx = $content.IndexOf($startMarker)
if ($startIdx -lt 0) { Write-Error "Start marker not found"; exit 1 }

# Find the closing )} AFTER the start marker (the chapter closing)
$searchFrom = $startIdx + $startMarker.Length
# We need the second occurrence of the endMarker after startIdx (one closes the && block)
$endIdx = $content.IndexOf($endMarker, $searchFrom)
if ($endIdx -lt 0) { Write-Error "End marker not found"; exit 1 }
$endIdx += $endMarker.Length  # include the marker itself

$newChapter6 = @'
            {/* CHAPTER 6: ICU INTELLIGENCE COMMAND CENTER */}
            {currentChapter === 6 && (
              <div style={{ width:'100%', maxWidth:1152, display:'flex', flexDirection:'column', gap:14 }} className="animate-fade-in">

                {/* STATUS BAR */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 16px', borderRadius:10, background:'#0D1117', border:'1px solid #1C2333', borderLeft:`3px solid ${riskTone==='high'?'#D97706':riskTone==='medium'?'#F59E0B':'#10B981'}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ width:7,height:7,borderRadius:'50%',background:riskTone==='high'?'#D97706':'#10B981',animation:'pulse 2s ease-in-out infinite',flexShrink:0,display:'inline-block' }}/>
                    <div>
                      <div style={{ fontFamily:'monospace',fontSize:9,fontWeight:700,color:'#8A8F98',textTransform:'uppercase',letterSpacing:'0.12em' }}>PulseGuard ICU · AI Analysis Complete</div>
                      <div style={{ color:'#fff',fontWeight:700,fontSize:13,marginTop:1 }}>{triageResponse ? activeRiskLabel : 'Awaiting Symptom Review'}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:20 }}>
                    {[{ k:'Confidence', v:triageResponse?`${Math.min(99,72+score/5).toFixed(1)}%`:'—', c:'#00D1FF' },{ k:'Risk Score', v:`${score}/100`, c:riskTone==='high'?'#D97706':'#10B981' },{ k:'References', v:`${ragChunks}`, c:'#8B97AA' }].map(({k,v,c})=>(
                      <div key={k} style={{ textAlign:'right' }}>
                        <div style={{ fontFamily:'monospace',fontSize:8,color:'#4B5A6E',textTransform:'uppercase',letterSpacing:'0.1em' }}>{k}</div>
                        <div style={{ fontFamily:'monospace',fontSize:13,fontWeight:700,color:c,marginTop:2 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* MAIN GRID: 7/5 split */}
                <div style={{ display:'grid', gridTemplateColumns:'7fr 5fr', gap:14, alignItems:'start' }}>

                  {/* ZONE 1: AI Intelligence (hero left) */}
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

                    {/* Hero Assessment */}
                    <div style={{ padding:18, borderRadius:12, background:'#0A0B10', border:'1px solid rgba(6,182,212,0.22)', boxShadow:'inset 0 1px 0 rgba(6,182,212,0.05)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, paddingBottom:10, borderBottom:'1px solid #1A1D24' }}>
                        <div style={{ width:22,height:22,borderRadius:'50%',background:'rgba(6,182,212,0.1)',border:'1px solid rgba(6,182,212,0.28)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="#06B6D4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                        <span style={{ fontFamily:'monospace',fontSize:9,fontWeight:700,color:'#06B6D4',textTransform:'uppercase',letterSpacing:'0.14em' }}>AI Clinical Assessment</span>
                        <div style={{ marginLeft:'auto',padding:'2px 8px',borderRadius:4,background:riskTone==='high'?'rgba(217,119,6,0.1)':'rgba(16,185,129,0.08)',border:`1px solid ${riskTone==='high'?'rgba(217,119,6,0.28)':'rgba(16,185,129,0.22)'}` }}>
                          <span style={{ fontFamily:'monospace',fontSize:8,fontWeight:700,color:riskTone==='high'?'#D97706':'#10B981',textTransform:'uppercase',letterSpacing:'0.1em' }}>{riskTone.toUpperCase()} RISK</span>
                        </div>
                      </div>
                      <p style={{ fontFamily:'monospace',fontSize:12,color:'#D1D5DB',lineHeight:1.75,margin:0 }}>{clinicalSummary}</p>
                    </div>

                    {/* Guidance */}
                    <div style={{ padding:14, borderRadius:10, background:'#0A0B10', border:'1px solid #1A1D24' }}>
                      <span style={{ fontFamily:'monospace',fontSize:9,fontWeight:700,color:'#8A8F98',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:8 }}>Operational Guidance</span>
                      <p style={{ fontFamily:'monospace',fontSize:12,color:'#D1D5DB',lineHeight:1.7,margin:0 }}>{guidance}</p>
                    </div>

                    {/* Insights + Safety */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      <div style={{ padding:12, borderRadius:10, background:'#0A0B10', border:'1px solid #1A1D24' }}>
                        <span style={{ fontFamily:'monospace',fontSize:9,fontWeight:700,color:'#8A8F98',textTransform:'uppercase',letterSpacing:'0.1em',display:'block',marginBottom:8 }}>Clinical Insights</span>
                        {(triageResponse?.operational_insights||['Complete symptom review to populate.']).map((item,i)=>(
                          <div key={i} style={{ display:'flex',gap:6,marginBottom:6,alignItems:'flex-start' }}>
                            <span style={{ color:'#06B6D4',flexShrink:0,fontSize:10,marginTop:1 }}>›</span>
                            <p style={{ fontFamily:'monospace',fontSize:10,color:'#D1D5DB',lineHeight:1.6,margin:0 }}>{item}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{ padding:12, borderRadius:10, background:'#0A0B10', border:'1px solid #1A1D24' }}>
                        <span style={{ fontFamily:'monospace',fontSize:9,fontWeight:700,color:'#8A8F98',textTransform:'uppercase',letterSpacing:'0.1em',display:'block',marginBottom:8 }}>Safety Protocols</span>
                        {(triageResponse?.safety_actions||['Run triage to populate protocols.']).map((item,i)=>(
                          <div key={i} style={{ display:'flex',gap:6,marginBottom:6,alignItems:'flex-start' }}>
                            <span style={{ color:'#10B981',flexShrink:0,fontSize:10,marginTop:1 }}>✓</span>
                            <p style={{ fontFamily:'monospace',fontSize:10,color:'#D1D5DB',lineHeight:1.6,margin:0 }}>{item}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ZONE 2: Escalation + Audit + Intelligence (right) */}
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

                    {/* Escalation */}
                    <div style={{ padding:14, borderRadius:10, background:'#0A0B10', border:'1px solid #1A1D24' }}>
                      <span style={{ fontFamily:'monospace',fontSize:9,fontWeight:700,color:'#8A8F98',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:10 }}>Escalation Routing</span>
                      <div style={{ display:'flex',flexDirection:'column',gap:7 }}>
                        {[{tier:'LOW',label:'Home Monitoring',color:'#10B981',active:riskTone==='low'},{tier:'MEDIUM',label:'Clinician Consult',color:'#F59E0B',active:riskTone==='medium'},{tier:'HIGH',label:'Emergency Escalation',color:'#D97706',active:riskTone==='high'}].map(({tier,label,color,active})=>(
                          <div key={tier} style={{ display:'flex',alignItems:'center',gap:9,padding:'8px 10px',borderRadius:7,background:active?`${color}10`:'transparent',border:`1px solid ${active?color+'3A':'#1A1D24'}`,transition:'all 0.2s' }}>
                            <div style={{ width:3,height:26,borderRadius:2,flexShrink:0,background:active?color:'#1A1D24' }}/>
                            <div style={{ flex:1 }}>
                              <div style={{ fontFamily:'monospace',fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em',color:active?color:'#4B5A6E' }}>{tier}</div>
                              <div style={{ fontSize:11,color:'#fff',fontWeight:500,marginTop:1 }}>{label}</div>
                            </div>
                            {active&&<span style={{ width:5,height:5,borderRadius:'50%',background:color,animation:'pulse 1.5s ease-in-out infinite',flexShrink:0,display:'inline-block' }}/>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Audit Trail */}
                    <div style={{ padding:14, borderRadius:10, background:'#0A0B10', border:'1px solid #1A1D24' }}>
                      <span style={{ fontFamily:'monospace',fontSize:9,fontWeight:700,color:'#8A8F98',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:9 }}>Triage Audit Trail</span>
                      <div style={{ display:'flex',flexDirection:'column',gap:5 }}>
                        {[{t:'Intake submitted',tag:'[START]',c:'#8A8F98',ts:'14:10'},{t:'Symptom extraction',tag:'[PARSE]',c:'#06B6D4',ts:'14:12'},{t:`Risk: ${score}/100`,tag:'[SCORE]',c:riskTone==='high'?'#D97706':'#10B981',ts:'14:14'},{t:activeRiskLabel,tag:'[ROUTE]',c:'#10B981',ts:'14:16'}].map(({t,tag,c,ts})=>(
                          <div key={tag} style={{ display:'flex',alignItems:'center',gap:7,fontFamily:'monospace',fontSize:10 }}>
                            <span style={{ color:'#4B5A6E',width:30,flexShrink:0 }}>{ts}</span>
                            <span style={{ color:c,fontWeight:700,width:50,flexShrink:0 }}>{tag}</span>
                            <span style={{ color:'#D1D5DB' }}>{t}</span>
                          </div>
                        ))}
                        {triageResponse&&(
                          <div style={{ display:'flex',alignItems:'center',gap:7,fontFamily:'monospace',fontSize:10 }}>
                            <span style={{ color:'#4B5A6E',width:30,flexShrink:0 }}>14:18</span>
                            <span style={{ color:'#10B981',fontWeight:700,width:50,flexShrink:0 }}>[DONE]</span>
                            <span style={{ color:'#10B981',animation:'pulse 2s ease-in-out infinite' }}>Complete</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* System Intelligence */}
                    <div style={{ padding:14, borderRadius:10, background:'#0A0B10', border:'1px solid #1A1D24' }}>
                      <span style={{ fontFamily:'monospace',fontSize:9,fontWeight:700,color:'#8A8F98',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:9 }}>System Intelligence</span>
                      {[{k:'Knowledge Refs',v:`${ragChunks} chunks`,c:'#06B6D4'},{k:'Language',v:language,c:'#A78BFA'},{k:'Confidence',v:triageResponse?`${Math.min(99,72+score/5).toFixed(1)}%`:'—',c:'#10B981'},{k:'Stage',v:triageResponse?.topology_stage||'Awaiting',c:riskTone==='high'?'#D97706':'#8A8F98'},{k:'Engine',v:'MedQuAD + GPT-4o',c:'#4B5A6E'}].map(({k,v,c})=>(
                        <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid #1A1D24',fontFamily:'monospace',fontSize:10 }}>
                          <span style={{ color:'#4B5A6E' }}>{k}</span>
                          <span style={{ fontWeight:700,color:c }}>{v}</span>
                        </div>
                      ))}
                      {triageResponse&&(
                        <button onClick={()=>setShowReport(true)} style={{ width:'100%',marginTop:10,padding:'6px 0',borderRadius:6,background:'transparent',border:'1px solid rgba(0,209,255,0.16)',color:'rgba(0,209,255,0.5)',fontFamily:'monospace',fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.14em',cursor:'pointer',transition:'all 0.2s' }}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(0,209,255,0.4)';e.currentTarget.style.color='#00D1FF';}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,209,255,0.16)';e.currentTarget.style.color='rgba(0,209,255,0.5)';}}>
                          ⬡ Export Intelligence Dossier
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* ZONE 3: TELEMETRY ROW */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                  {[{label:'SpO2',value:metrics.spo2,unit:'%',spark:metrics.spo2Spark,color:riskTone==='high'?'#D97706':'#10B981',trend:metrics.spo2Trend},{label:'Heart Rate',value:metrics.bpm,unit:'bpm',spark:metrics.bpmSpark,color:'#06B6D4',trend:metrics.bpmTrend},{label:'Resp Rate',value:metrics.resp,unit:'/min',spark:metrics.respSpark,color:'#A78BFA',trend:metrics.respTrend},{label:'Risk Index',value:metrics.riskScore,unit:'/100',spark:[score*.6,score*.7,score*.8,score*.9,score,score],color:riskTone==='high'?'#F59E0B':'#10B981',trend:riskTone==='high'?'▲':'▼'}].map(({label,value,unit,spark,color,trend})=>(
                    <div key={label} style={{ padding:13,borderRadius:10,background:'#0A0B10',border:'1px solid #1A1D24',boxShadow:`0 0 0 1px ${color}07`,display:'flex',flexDirection:'column' }}>
                      <div style={{ fontFamily:'monospace',fontSize:9,fontWeight:700,color:'#8A8F98',textTransform:'uppercase',letterSpacing:'0.1em' }}>{label}</div>
                      <div style={{ display:'flex',alignItems:'baseline',gap:4,margin:'7px 0' }}>
                        <span style={{ fontSize:24,fontWeight:700,color:'#fff',lineHeight:1 }}>{value}</span>
                        <span style={{ fontSize:10,color:'#4B5A6E' }}>{unit}</span>
                        <span style={{ fontSize:11,fontWeight:700,marginLeft:2,color }}>{trend}</span>
                      </div>
                      <Sparkline data={spark} color={color} />
                    </div>
                  ))}
                </div>

              </div>
            )}
'@

$before = $content.Substring(0, $startIdx)
$after  = $content.Substring($endIdx)
$newContent = $before + $newChapter6 + $after

Set-Content -Path $file -Value $newContent -NoNewline -Encoding UTF8
Write-Host "Chapter 6 patched successfully."
