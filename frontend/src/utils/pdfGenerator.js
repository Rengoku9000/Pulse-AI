import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function downloadReportPdf(reportElement, reportId) {
  if (!reportElement) {
    throw new Error("Report preview is not ready.");
  }

  const canvas = await html2canvas(reportElement, {
    scale: Math.min(2, window.devicePixelRatio || 1.5),
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: reportElement.scrollWidth,
  });

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const printableWidth = pageWidth - margin * 2;
  const printableHeight = pageHeight - margin * 2;
  const imgWidth = printableWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const pageCanvasHeight = Math.floor((printableHeight * canvas.width) / imgWidth);

  let sourceY = 0;
  let page = 0;

  while (sourceY < canvas.height) {
    const sliceHeight = Math.min(pageCanvasHeight, canvas.height - sourceY);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;

    const ctx = pageCanvas.getContext("2d");
    ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    const imgData = pageCanvas.toDataURL("image/png", 0.98);
    const renderedHeight = Math.min(printableHeight, (sliceHeight * imgWidth) / canvas.width);

    if (page > 0) pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, margin, imgWidth, renderedHeight);
    pdf.setFontSize(8);
    pdf.setTextColor(112, 112, 112);
    pdf.text(`Pulse AI Report ${reportId} | Page ${page + 1}`, margin, pageHeight - 12);

    sourceY += sliceHeight;
    page += 1;
  }

  pdf.save(`PulseAI_Report_${reportId}.pdf`);
}
