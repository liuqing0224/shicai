import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCheck, LoaderCircle, Sparkles, XCircle } from 'lucide-react'
import { api } from './api'
import { formatCoverage, formatInterviewDimensionScore, latestActiveInterviewEvaluationTask, waitForInterviewEvaluation } from './interviewEvaluationUtils'
import type { Candidate, ClaimVerificationStatus, InterviewEvaluationDimensionStatus } from './types'
import './interviewEvaluation.css'

export function InterviewEvaluationView({ candidate, onUpdated }: { candidate: Candidate; onUpdated: (candidate: Candidate) => void }) {
  const [transcript, setTranscript] = useState(candidate.interviewTranscript || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  const activeTask = latestActiveInterviewEvaluationTask(candidate.tasks)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => { setTranscript(candidate.interviewTranscript || '') }, [candidate.id, candidate.interviewTranscript])
  useEffect(() => {
    if (!activeTask) return
    let cancelled = false
    setLoading(true); setError('')
    void waitForInterviewEvaluation({
      load: () => api.candidate(candidate.id),
      initialCreatedAt: candidate.interviewEvaluationCreatedAt,
      initialTasks: candidate.tasks,
    }).then((updated) => {
      if (!cancelled && mounted.current) onUpdated(updated)
    }).catch((cause) => {
      if (!cancelled && mounted.current) setError(cause instanceof Error ? cause.message : '面试评价生成失败，请重试')
    }).finally(() => {
      if (!cancelled && mounted.current) setLoading(false)
    })
    return () => { cancelled = true }
  }, [activeTask, candidate.id, candidate.interviewEvaluationCreatedAt, candidate.tasks, onUpdated])

  const generate = async () => {
    const value = transcript.trim()
    if (!value) { setError('请先粘贴完整的面试对话记录'); return }
    setLoading(true); setError('')
    try {
      const baseline = await api.candidate(candidate.id)
      await api.generateInterviewEvaluation(candidate.id, value)
      const updated = await waitForInterviewEvaluation({
        load: () => api.candidate(candidate.id),
        initialCreatedAt: baseline.interviewEvaluationCreatedAt,
        initialTasks: baseline.tasks,
      })
      if (mounted.current) onUpdated(updated)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '面试评价生成失败，请重试')
    } finally { if (mounted.current) setLoading(false) }
  }

  return <section className="detail-section interview-evaluation">
    <div className="evaluation-title"><div><h3>面试评价</h3><p>粘贴完整对话记录，评价将结合岗位画像和简历主张生成。</p></div><ClipboardCheck size={20} /></div>
    <label className="transcript-field"><span>面试对话记录 <b>{transcript.length.toLocaleString('zh-CN')} 字</b></span><textarea rows={10} value={transcript} disabled={loading} onChange={(event) => setTranscript(event.target.value)} placeholder="在此粘贴面试官与候选人的完整对话记录…" /></label>
    <div className="evaluation-action"><button className="primary-button" disabled={loading} onClick={() => void generate()}>{loading ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{loading ? '正在生成评价…' : '生成面试评价'}</button>{loading && <span>正在分析对话并核验岗位要求，请稍候。</span>}</div>
    {error && <p className="evaluation-error" role="alert"><AlertTriangle size={15} />{error}</p>}
    {candidate.interviewEvaluation && <EvaluationResult candidate={candidate} />}
  </section>
}

function EvaluationResult({ candidate }: { candidate: Candidate }) {
  const evaluation = candidate.interviewEvaluation!
  const recommendation = { pass: '通过', conditional_pass: '有条件通过', reject: '不通过' }[evaluation.recommendation]
  const verdictIcon = evaluation.recommendation === 'reject' ? <XCircle size={15} /> : <CheckCircle2 size={15} />
  return <div className="evaluation-result">
    <div className="evaluation-verdict"><span className={`verdict verdict-${evaluation.recommendation}`}>{verdictIcon}{recommendation}</span><div><strong>{formatCoverage(evaluation.assessedCoverageWeight)}</strong><small>证据覆盖率</small></div><div><strong>{evaluation.weightedScore == null ? '-' : evaluation.weightedScore.toFixed(1)}</strong><small>1-4 加权分</small></div></div>
    <p className="evaluation-summary">{evaluation.summary}</p>
    <div className="evaluation-findings"><Finding title="优势" items={evaluation.strengths} tone="positive" /><Finding title="主要不足" items={[...evaluation.concerns, ...evaluation.criticalGaps]} tone="negative" /><Finding title="未充分评估" items={evaluation.notAssessed} tone="neutral" /></div>
    {evaluation.dimensions.length > 0 && <div className="evaluation-block"><h4>岗位画像维度</h4><div className="evaluation-dimensions">{evaluation.dimensions.map((dimension) => { const score = formatInterviewDimensionScore(dimension.status, dimension.score); return <div className={`evaluation-dimension dimension-${dimension.status}`} key={dimension.id}><div><strong>{dimension.name}</strong><span>权重 {Math.round(dimension.weight * 100)}%</span><StatusLabel status={dimension.status} />{score && <b>{score}</b>}</div><p>{dimension.assessment}</p>{dimension.evidence.length > 0 && <ul>{dimension.evidence.map((item, index) => <li key={index}>{item}</li>)}</ul>}</div> })}</div></div>}
    {evaluation.claimVerifications.length > 0 && <div className="evaluation-block"><h4>简历主张核验</h4><div className="claim-list">{evaluation.claimVerifications.map((item, index) => <div className={`claim-row claim-${item.status}`} key={`${item.claim}-${index}`}><div><strong>{item.claim}</strong><ClaimLabel status={item.status} /></div><p>{item.assessment}</p>{item.evidence.length > 0 && <ul>{item.evidence.map((evidence, evidenceIndex) => <li key={evidenceIndex}>{evidence}</li>)}</ul>}</div>)}</div></div>}
  </div>
}

function Finding({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return <div className={`evaluation-finding finding-${tone}`}><h4>{title}</h4>{items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>暂无</p>}</div>
}

function StatusLabel({ status }: { status: InterviewEvaluationDimensionStatus }) {
  const labels = { demonstrated: '表现充分', partial: '部分表现', gap: '存在差距', not_assessed: '未评估' }
  return <em>{labels[status]}</em>
}

function ClaimLabel({ status }: { status: ClaimVerificationStatus }) {
  const labels = { verified: '已验证', partially_verified: '部分验证', insufficient_evidence: '证据不足', not_assessed: '未评估', contradicted: '存在矛盾' }
  return <em>{labels[status]}</em>
}
