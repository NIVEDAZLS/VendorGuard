"""
Email utility — send via Gmail SMTP.

When DRY_RUN_EMAIL=true (default for local dev) emails are printed
to console instead of being sent.
"""

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime

from backend.utils.secrets import get

_DRY_RUN = get("DRY_RUN_EMAIL", "true").lower() == "true"


def send_email(
    to: str,
    subject: str,
    body: str,
    cc: list[str] | None = None,
) -> None:
    """Send a plain-text email. In dry-run mode, prints to console."""
    cc = cc or []

    if _DRY_RUN:
        sep = "─" * 60
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"\n[DRY-RUN EMAIL] {ts}")
        print(sep)
        print(f"  To      : {to}")
        if cc:
            print(f"  CC      : {', '.join(cc)}")
        print(f"  Subject : {subject}")
        print(sep)
        print(body)
        print(sep + "\n")
        return

    sender = os.environ["GMAIL_SENDER"]
    password = os.environ["GMAIL_APP_PASSWORD"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to
    if cc:
        msg["Cc"] = ", ".join(cc)

    msg.attach(MIMEText(body, "plain"))

    recipients = [to] + cc
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(sender, password)
        server.sendmail(sender, recipients, msg.as_string())
