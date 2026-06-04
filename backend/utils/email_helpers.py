"""
Email address helpers.

All outbound emails fall back to FALLBACK_EMAIL when the vendor has no
contact_email on file in the vendors table. This ensures nothing is
silently sent to a placeholder address.
"""

FALLBACK_EMAIL = "nivethitha.jm@ganitinc.com"


def vendor_email(contact_email: str | None) -> str:
    """Return the vendor's contact email, or the fallback if absent."""
    if contact_email and contact_email.strip():
        return contact_email.strip()
    return FALLBACK_EMAIL
