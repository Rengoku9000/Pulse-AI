const REPORT_HISTORY_KEY = "pulseai_report_history";

const pad = (value) => String(value).padStart(2, "0");

export function createReportId(date = new Date()) {
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PAI-${stamp}-${suffix}`;
}

export function getSeverityMeta(score = 0, riskLevel = "") {
  if (score >= 70) {
    return {
      label: "High Risk",
      tone: "high",
      color: "#B42318",
      bg: "#FEF3F2",
      border: "#FDA29B",
      description: "Urgent medical attention is recommended.",
    };
  }
  if (score >= 30 || /elevated|observation/i.test(riskLevel)) {
    return {
      label: "Moderate Risk",
      tone: "moderate",
      color: "#B54708",
      bg: "#FFFAEB",
      border: "#FEDF89",
      description: "Medical advice is recommended if symptoms persist or worsen.",
    };
  }
  return {
    label: "Low Risk",
    tone: "low",
    color: "#027A48",
    bg: "#ECFDF3",
    border: "#ABEFC6",
    description: "General guidance and monitoring may be appropriate.",
  };
}

export function buildMedicalReport({ triageResponse, patientMessage, patientDetails = {}, existingReportId }) {
  const now = new Date();
  const reportId = existingReportId || createReportId(now);
  const score = triageResponse?.emergency_score ?? 0;
  const severity = getSeverityMeta(score, triageResponse?.risk_level);
  const symptoms = patientMessage?.trim() || "No symptoms provided.";
  const reportedSymptoms = symptoms
    .split(/[,.]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    reportId,
    generatedAt: now.toLocaleString(),
    isoTimestamp: now.toISOString(),
    platform: "Pulse AI",
    patient: {
      name: patientDetails.name || "Demo Patient",
      age: patientDetails.age || "Not specified",
      gender: patientDetails.gender || "Not specified",
    },
    symptoms,
    reportedSymptoms: reportedSymptoms.length ? reportedSymptoms : [symptoms],
    finalAiSummary:
      triageResponse?.guidance ||
      "Final AI guidance is not available yet.",
    analysisSummary:
      triageResponse?.clinical_summary ||
      triageResponse?.guidance ||
      "AI analysis summary is not available yet.",
    predictedConditions: derivePredictedConditions(symptoms, triageResponse),
    severity,
    score,
    riskLevel: triageResponse?.risk_level || severity.label,
    recommendation:
      triageResponse?.emergency_recommendation ||
      "Consult a qualified healthcare professional if symptoms persist or worsen.",
    precautions: triageResponse?.safety_actions?.length
      ? triageResponse.safety_actions
      : [
          "Monitor symptoms and note any change in severity.",
          "Seek care if new severe symptoms appear.",
          "Do not use this report as a final diagnosis.",
        ],
    adviceDisclaimer:
      triageResponse?.disclaimer ||
      "Suggested advice is informational only. A licensed clinician should confirm any treatment or medicine.",
    context: triageResponse?.retrieved_context || [],
    telemetry: triageResponse?.telemetry || {},
    emergencyWarning:
      score >= 70
        ? "High-risk symptoms were detected. Please seek emergency care now or contact local emergency services."
        : "",
    verificationText: `Pulse AI report ${reportId} generated at ${now.toISOString()}`,
  };
}

function derivePredictedConditions(symptoms, triageResponse) {
  const text = symptoms.toLowerCase();
  const conditions = [];
  if (/chest|breath|breathing|heart|pressure/.test(text)) {
    conditions.push("Possible cardiopulmonary warning signs");
  }
  if (/fever|cough|throat|fatigue/.test(text)) {
    conditions.push("Possible infectious or respiratory illness pattern");
  }
  if (/dizz|faint|weak|headache|stroke|seizure/.test(text)) {
    conditions.push("Possible neurological or dehydration-related concern");
  }
  if (/vomit|nausea|stomach|diarrhea/.test(text)) {
    conditions.push("Possible gastrointestinal illness pattern");
  }
  if (!conditions.length && triageResponse?.risk_level) {
    conditions.push(`${triageResponse.risk_level} symptom pattern`);
  }
  return conditions.length ? conditions : ["No specific condition prediction available"];
}

export function saveReportHistory(report) {
  try {
    const current = JSON.parse(localStorage.getItem(REPORT_HISTORY_KEY) || "[]");
    const next = [
      {
        reportId: report.reportId,
        generatedAt: report.generatedAt,
        severity: report.severity.label,
        patientName: report.patient.name,
      },
      ...current.filter((item) => item.reportId !== report.reportId),
    ].slice(0, 10);
    localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export function getReportHistory() {
  try {
    return JSON.parse(localStorage.getItem(REPORT_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}
