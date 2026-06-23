interface SendEmailOptions {
  to: { email: string; name?: string }[]
  subject?: string
  html?: string
  text?: string
  template_id?: string
  personalization?: { email: string; data: Record<string, string> }[]
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new Error(`Email send failed: ${await res.text()}`)
}
