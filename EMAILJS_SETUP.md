# EmailJS Setup Guide for Calendar Reminders

## Step 1: Create EmailJS Account

1. Go to [https://www.emailjs.com/](https://www.emailjs.com/)
2. Sign up for a free account
3. Verify your email address

## Step 2: Create an Email Service

1. In your EmailJS dashboard, go to **Email Services**
2. Click **Add New Service**
3. Choose your email provider (Gmail, Outlook, etc.)
4. Follow the setup instructions for your provider
5. Note down your **Service ID** (you'll need this later)

## Step 3: Create an Email Template

1. Go to **Email Templates** in your dashboard
2. Click **Create New Template**
3. Use this template structure:

```
Subject: تذكير: {{event_title}}

مرحباً {{to_name}},

هذا تذكير بالموعد التالي:

العنوان: {{event_title}}
التاريخ: {{event_date}}
الوقت: {{event_time}}

التفاصيل:
{{event_note}}

شكراً لك!
نظام إدارة الإنشاءات
```

4. Note down your **Template ID**

## Step 4: Get Your Public Key

1. Go to **Account** → **General**
2. Find your **Public Key**
3. Copy it for later use

## Step 5: Update the Calendar Component

Open `src/pages/Calendar.tsx` and replace these placeholders with your actual values:

```typescript
// Line 102 - Replace with your actual EmailJS credentials
await emailjs.send(
  "YOUR_SERVICE_ID", // Replace with your Service ID
  "YOUR_TEMPLATE_ID", // Replace with your Template ID
  {
    to_email: event.userEmail,
    to_name: currentUser?.displayName || "مستخدم",
    event_title: event.title,
    event_date: format(new Date(event.date), "dd/MM/yyyy"),
    event_time: event.time,
    event_note: event.note,
  },
  "YOUR_PUBLIC_KEY" // Replace with your Public Key
);
```

## Example Configuration

After setup, your EmailJS configuration should look like this:

```typescript
await emailjs.send(
  "service_abc123", // Your Service ID
  "template_xyz789", // Your Template ID
  {
    to_email: event.userEmail,
    to_name: currentUser?.displayName || "مستخدم",
    event_title: event.title,
    event_date: format(new Date(event.date), "dd/MM/yyyy"),
    event_time: event.time,
    event_note: event.note,
  },
  "user_def456" // Your Public Key
);
```

## Testing

1. Create a test event in the calendar
2. Set the time to be within 5 minutes of the current time
3. Check your email to see if the reminder arrives
4. Monitor the browser console for any error messages

## Free Tier Limits

- **200 emails per month** on the free plan
- If you need more, consider upgrading to a paid plan

## Troubleshooting

- Make sure your email service is properly configured in EmailJS
- Check that your template variables match exactly
- Verify your Public Key is correct
- Check browser console for error messages
- Ensure your email provider allows EmailJS access

## Security Notes

- EmailJS handles email sending securely through their servers
- Your email credentials are stored safely in EmailJS, not in your code
- The Public Key is safe to use in frontend code
- Users will only receive reminders for their own events
