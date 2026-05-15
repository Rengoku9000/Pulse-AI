import * as React from "react";
import QRCode from "qrcode";
import { Download, FileCheck2, Printer, ShieldCheck, Stethoscope } from "lucide-react";
import { buildMedicalReport, getReportHistory, saveReportHistory } from "./utils/reportData";
import { downloadReportPdf } from "./utils/pdfGenerator";

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`report-toast ${toast.type === "error" ? "report-toast-error" : "report-toast-success"}`}>
      {toast.message}
    </div>
  );
}

function ReportTable({ rows }) {
  return (
    <table className="report-table">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th>{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ListBlock({ items }) {
  return (
    <ul className="report-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function MedicalReportPreview({ triageResponse, patientMessage }) {
  const reportRef = React.useRef(null);
  const [reportId] = React.useState(() => buildMedicalReport({ triageResponse, patientMessage }).reportId);
  const [qrCode, setQrCode] = React.useState("");
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [history, setHistory] = React.useState(() => getReportHistory());

  const report = React.useMemo(
    () => buildMedicalReport({ triageResponse, patientMessage, existingReportId: reportId }),
    [triageResponse, patientMessage, reportId],
  );

  React.useEffect(() => {
    let active = true;
    QRCode.toDataURL(report.verificationText, {
      width: 108,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((url) => active && setQrCode(url))
      .catch(() => active && setQrCode(""));
    return () => {
      active = false;
    };
  }, [report.verificationText]);

  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleDownload = async () => {
    setIsGenerating(true);
    setToast(null);
    try {
      await downloadReportPdf(reportRef.current, report.reportId);
      setHistory(saveReportHistory(report));
      setToast({ type: "success", message: `Report ${report.reportId} downloaded successfully.` });
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Unable to generate PDF report." });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!triageResponse) return null;

  return (
    <section className="report-shell">
      <Toast toast={toast} />
      <div className="report-toolbar">
        <div>
          <p className="report-eyebrow">AI-generated medical-style report</p>
          <h2>Pulse AI Patient Report</h2>
          <span>Preview the report before download. PDF output uses a clean white hospital format.</span>
        </div>
        <div className="report-actions">
          <button className="report-button report-button-secondary" onClick={handlePrint} type="button">
            <Printer size={16} />
            Print Report
          </button>
          <button className="report-button report-button-primary" onClick={handleDownload} disabled={isGenerating} type="button">
            {isGenerating ? <span className="report-spinner" /> : <Download size={16} />}
            {isGenerating ? "Generating PDF..." : "Download Report as PDF"}
          </button>
        </div>
      </div>

      <div className="report-preview-wrap">
        <article ref={reportRef} className="medical-report">
          <header className="medical-report-header">
            <div className="report-logo">
              <div className="report-logo-mark">
                <Stethoscope size={25} />
              </div>
              <div>
                <h1>Pulse AI</h1>
                <p>Healthcare Triage Assistant</p>
              </div>
            </div>
            <div className="report-id-block">
              <span>Medical AI Report</span>
              <strong>{report.reportId}</strong>
              <small>{report.generatedAt}</small>
            </div>
          </header>

          <div className="report-notice">
            <ShieldCheck size={18} />
            <span>This is an AI-generated symptom guidance report, not a final medical diagnosis.</span>
          </div>

          <section className="report-grid two">
            <div className="report-card">
              <h3>Patient Details</h3>
              <ReportTable
                rows={[
                  ["Name", report.patient.name],
                  ["Age", report.patient.age],
                  ["Gender", report.patient.gender],
                  ["Date & Time", report.generatedAt],
                  ["Report ID", report.reportId],
                ]}
              />
            </div>

            <div className="report-card severity-card">
              <h3>Severity Indicator</h3>
              <div
                className="severity-badge"
                style={{
                  color: report.severity.color,
                  background: report.severity.bg,
                  borderColor: report.severity.border,
                }}
              >
                {report.severity.label}
              </div>
              <div className="severity-score">
                <strong>{report.score}/100</strong>
                <span>{report.riskLevel}</span>
              </div>
              <p>{report.severity.description}</p>
            </div>
          </section>

          <section className="report-card">
            <h3>Symptoms Entered</h3>
            <p className="symptom-box">{report.symptoms}</p>
          </section>

          <section className="report-card final-summary-card">
            <h3>Final AI Summary</h3>
            <p>{report.finalAiSummary}</p>
          </section>

          <section className="report-grid two">
            <div className="report-card">
              <h3>Supporting Analysis Summary</h3>
              <p>{report.analysisSummary}</p>
            </div>
            <div className="report-card">
              <h3>Predicted Conditions</h3>
              <ListBlock items={report.predictedConditions} />
            </div>
          </section>

          <section className="report-grid two">
            <div className="report-card">
              <h3>Recommended Precautions</h3>
              <ListBlock items={report.precautions} />
            </div>
            <div className="report-card">
              <h3>Suggested Medicines / Advice Disclaimer</h3>
              <p>{report.adviceDisclaimer}</p>
              <p className="medicine-note">
                Pulse AI does not prescribe medicines. Any medication, dosage, or treatment must be confirmed by a licensed clinician.
              </p>
            </div>
          </section>

          {report.emergencyWarning && (
            <section className="emergency-warning">
              <h3>Emergency Warning</h3>
              <p>{report.emergencyWarning}</p>
            </section>
          )}

          <section className="report-grid verification-grid">
            <div className="report-card qr-card">
              <h3>QR Verification</h3>
              {qrCode ? <img src={qrCode} alt="Report verification QR code" /> : <div className="qr-placeholder" />}
              <span>Scan to verify report ID and timestamp.</span>
            </div>
            <div className="report-card signature-card">
              <h3>Digital Signature</h3>
              <div className="signature-line">Pulse AI Clinical Safety Layer</div>
              <span>Digitally prepared by Pulse AI</span>
            </div>
          </section>

          <footer className="report-footer">
            <FileCheck2 size={16} />
            <span>This report is AI-generated and not a substitute for professional medical advice.</span>
          </footer>
        </article>
      </div>

      {history.length > 0 && (
        <div className="report-history">
          <h3>Recent Downloads</h3>
          {history.slice(0, 3).map((item) => (
            <div key={item.reportId}>
              <strong>{item.reportId}</strong>
              <span>{item.generatedAt} - {item.severity}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
