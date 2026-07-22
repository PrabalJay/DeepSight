import os
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from models.schemas import AnalysisResult

def generate_forensic_report(result: AnalysisResult) -> str:
    """
    Generates a PDF forensic report using ReportLab.
    Returns the file path of the generated report.
    """
    report_filename = f"report_{result.file_id}.pdf"
    report_path = os.path.join("reports", report_filename)
    
    c = canvas.Canvas(report_path, pagesize=letter)
    width, height = letter
    
    c.setFont("Helvetica-Bold", 20)
    c.drawString(50, height - 50, "Deep Sight Forensic Report")
    
    c.setFont("Helvetica", 12)
    c.drawString(50, height - 100, f"File ID: {result.file_id}")
    c.drawString(50, height - 120, f"Media Type: {result.file_type}")
    
    # Status
    status_text = "Manipulated (Deepfake Detected)" if result.is_deepfake else "Authentic"
    c.drawString(50, height - 150, f"Overall Assessment: {status_text}")
    
    c.drawString(50, height - 180, "Confidence Scores:")
    y = height - 200
    for score in result.confidence_scores:
        c.drawString(70, y, f"- {score.label}: {score.score:.2%}")
        y -= 20
        
    c.drawString(50, y - 20, "Detailed Analysis:")
    c.drawString(70, y - 40, "Advanced AI models have scanned the file for inconsistencies")
    c.drawString(70, y - 60, "in visual/audio artifacts, temporal coherence, and frequency domain anomalies.")
    
    c.save()
    
    return f"/reports/{report_filename}"
