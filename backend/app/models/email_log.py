from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Text, DateTime
from app.models.base import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class EmailScanLog(Base):
    """One row per scan run — stores summary stats and any error."""
    __tablename__ = "email_scan_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scanned_at = Column(DateTime, default=utcnow, nullable=False)
    emails_checked = Column(Integer, default=0, nullable=False)
    updates_made = Column(Integer, default=0, nullable=False)
    error = Column(Text, nullable=True)


class ProcessedEmail(Base):
    """Tracks Message-IDs so the same email is never applied twice."""
    __tablename__ = "processed_emails"

    message_id = Column(String, primary_key=True)
    processed_at = Column(DateTime, default=utcnow, nullable=False)
