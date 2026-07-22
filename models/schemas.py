from pydantic import BaseModel
from typing import List, Optional

class ConfidenceScore(BaseModel):
    label: str
    score: float

class AnalysisResult(BaseModel):
    file_id: str
    file_type: str
    is_deepfake: bool
    confidence_scores: List[ConfidenceScore]
    heatmap_url: Optional[str] = None
    message: str

class ReportResponse(BaseModel):
    file_id: str
    report_url: str
