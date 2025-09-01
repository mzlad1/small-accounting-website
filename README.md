# Construction Management System

A comprehensive React + Vite + Firebase application for managing construction business operations including customers, orders, payments, checks, and financial reporting.

## Features

- **Dashboard**: Overview of business metrics and recent activity
- **Customer Management**: Add, edit, and manage customer information
- **Order Management**: Create and track orders with multiple items
- **Payment Tracking**: Record and monitor customer payments
- **Check Management**: Track both customer and personal checks
- **Account Statements**: View customer account balances and history
- **Reports**: Generate business reports with date range filtering

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend**: Firebase (Firestore, Authentication, Storage)
- **Routing**: React Router DOM
- **Icons**: Lucide React
- **Forms**: React Hook Form + Yup validation
- **Date Handling**: date-fns

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Firebase project

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd construction-management
```

2. Install dependencies:

```bash
npm install
```

3. Configure Firebase:

   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Firestore, Authentication, and Storage
   - Copy your Firebase config to `src/config/firebase.ts`

4. Update Firebase configuration in `src/config/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-messaging-sender-id",
  appId: "your-app-id",
};
```

5. Start the development server:

```bash
npm run dev
```

6. Open [http://localhost:5173](http://localhost:5173) in your browser

## Project Structure

```
src/
├── components/          # Reusable UI components
│   └── Layout.tsx     # Main layout with navigation
├── config/             # Configuration files
│   └── firebase.ts    # Firebase configuration
├── pages/              # Page components
│   ├── Dashboard.tsx  # Main dashboard
│   ├── Customers.tsx  # Customer management
│   ├── Orders.tsx     # Order management
│   ├── Payments.tsx   # Payment tracking
│   ├── Checks.tsx     # Check management
│   ├── Statements.tsx # Account statements
│   └── Reports.tsx    # Business reports
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
├── App.tsx            # Main app component
└── main.tsx           # App entry point
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Next Steps

The application is set up with a basic structure and navigation. Each page is currently a placeholder that will be developed incrementally:

1. **Customers Page**: Customer CRUD operations, search, and filtering
2. **Orders Page**: Order creation, item management, and status tracking
3. **Payments Page**: Payment recording and outstanding balance tracking
4. **Checks Page**: Check management for both customers and personal use
5. **Statements Page**: Account statements with date filtering
6. **Reports Page**: Business analytics and reporting

## Contributing

This is a development project. Each page will be built step by step with full functionality including:

- Firebase integration
- Form handling and validation
- Data management and state
- Responsive design
- Error handling

## License

This project is for internal business use.
