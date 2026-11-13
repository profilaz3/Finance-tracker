# Finance App Analysis

## Executive Summary

The Finance app is a comprehensive personal finance management application built with React 19, Vite, and Supabase. It features multi-currency support, transaction tracking, debt/loan management, shared expenses for events, and analytics with beautiful Material Design 3 (M3) theming.

---

## 1. Technology Stack

### Core Framework & Build Tools
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.0 | UI framework |
| Vite | 6.2.0 | Build tool and dev server |
| TypeScript | 5.8.2 | Type safety |
| @vitejs/plugin-react | 5.0.0 | React plugin for Vite |

### UI & Styling
| Technology | Version | Purpose |
|------------|---------|---------|
| Tailwind CSS | - | Utility-first CSS (via PostCSS) |
| Framer Motion | 11.0.0 | Animations |
| Lucide React | 0.554.0 | Icon library |
| clsx | 2.1.1 | Conditional className utility |

### Backend & Data
| Technology | Version | Purpose |
|------------|---------|---------|
| @supabase/supabase-js | 2.86.0 | Backend-as-a-Service (Auth, DB, Storage) |
| uuid | 13.0.0 | Unique ID generation |

### Data Visualization
| Technology | Version | Purpose |
|------------|---------|---------|
| Recharts | 3.4.1 | Charts and graphs |

### Virtualization & Performance
| Technology | Version | Purpose |
|------------|---------|---------|
| react-virtuoso | 4.16.1 | Virtual scrolling for large lists |
| react-virtualized-auto-sizer | 1.0.26 | Auto-sizing for virtual lists |
| react-window | 2.2.3 | Windowed rendering |

### Export & AI Features
| Technology | Version | Purpose |
|------------|---------|---------|
| jspdf | 3.0.4 | PDF generation |
| jspdf-autotable | 5.0.2 | PDF tables |
| @google/genai | 1.30.0 | Google AI integration |
| openai | 6.15.0 | OpenAI API integration |
| react-markdown | 10.1.0 | Markdown rendering |

### Mobile & PWA
| Technology | Version | Purpose |
|------------|---------|---------|
| @capacitor/core | 7.4.4 | Cross-platform mobile runtime |
| @capacitor/android | 7.4.4 | Android build support |
| @capacitor/cli | 7.4.4 | Capacitor CLI |
| vite-plugin-pwa | 1.2.0 | PWA support |

### Utilities
| Technology | Version | Purpose |
|------------|---------|---------|
| date-fns | 4.1.0 | Date manipulation |

---

## 2. Core Features

### 2.1 Transaction Management
- **Add/Edit/Delete** transactions with full CRUD operations
- **Transaction Types**: Income and Expense
- **Multi-currency Support**: EUR, USD, RSD with automatic conversion
- **Categories & Subcategories**: Hierarchical categorization
- **Receipt Support**: Receipt data with items, quantities, and merchant info
- **Fees Tracking**: Optional fee field for transactions
- **Search & Filter**: Filter by type, account, date range
- **Export**: CSV and PDF export functionality

### 2.2 Account Management
- **Account Types**: Cash, Bank, Digital, Other
- **Multi-currency Accounts**: Each account can have its own currency
- **Initial Balance**: Set starting balance for accounts
- **Account Ordering**: Custom order for display
- **Color & Icon**: Visual customization per account

### 2.3 Categories
- **Built-in Categories**: Food & Dining, Transportation, Housing, Salary, Entertainment, Health, Investments, Reimbursement
- **Special Categories**:
  - Internal Transfer (excluded from income/expense totals)
  - Debt Repayment (Incoming)
  - Loan Repayment (Outgoing)
- **Subcategories**: Each category has predefined subcategories
- **Color Coding**: Visual distinction for categories

### 2.4 People & Debt/Loan Management
- **Person Profiles**: Name, avatar, color, default currency
- **Multi-currency Balances**: Track debts/loans in different currencies
- **Balance Tracking**:
  - Positive balance: Person owes you (loan)
  - Negative balance: You owe person (debt)
- **Settlement**: One-click settlement with automatic transaction creation
- **Transaction Splitting**: Split expenses between people
- **History View**: View all transactions linked to a person

### 2.5 Events & Shared Expenses
- **Event Creation**: Create events with name, description, dates, and participants
- **Event Sharing**: Share events via email with other users
- **Shared Expenses**:
  - Track expenses paid by different people
  - Split types: Equal or Exact amounts
  - Split details for custom splits
- **Event Status**: Active, Completed, Archived
- **Event Photos**: Upload photos to events
- **Auto-navigation**: Automatically navigate to shared events for participants

### 2.6 Analytics
- **Spending Trend**: Daily, Weekly, Monthly views with area chart
- **Income vs Expense**: Weekly, Monthly, Quarterly, Yearly comparison with bar chart
- **Category Breakdown**: Pie chart showing expense distribution
- **Total Fees**: Track fees paid as percentage of total expenses
- **Currency Conversion**: All analytics converted to base currency

### 2.7 Calendar View
- **Calendar-based transaction viewing**
- **Add transactions directly from calendar**
- **Visual representation of spending patterns**

### 2.8 Settings & Customization
- **Themes**: 11 different themes (Neon, Racing Orange, OLED, Coffee, Royal Purple, Crimson Red, Lime Dark, Electric Blue, Sunset Orange, Cyberpunk Pink, Aurora)
- **Languages**: English and Serbian
- **Base Currency**: Select default currency for display
- **Account Management**: Add, edit, delete accounts
- **Category Management**: Add, edit, delete categories
- **People Management**: Add, edit, delete people
- **Google Sheets Sync**: (placeholder for future integration)
- **AI Settings**: OpenAI API key for AI features
- **Account Deletion**: Full account deletion with Supabase edge function

---

## 3. Database Schema

### Tables

#### `transactions`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Foreign key to auth.users |
| date | timestamp | Transaction date |
| amount | numeric | Transaction amount |
| currency | text | Currency code (EUR, USD, RSD) |
| category_id | text | Foreign key to categories |
| account_id | text | Foreign key to accounts |
| person_id | text | Foreign key to people (optional) |
| subcategory | text | Subcategory name |
| note | text | Transaction note |
| type | text | 'income' or 'expense' |
| receipt_data | jsonb | Receipt items and merchant info |
| fees | numeric | Optional fees |
| event_id | text | Foreign key to events (optional) |

#### `categories`
| Column | Type | Description |
|--------|------|-------------|
| id | text | Primary key |
| user_id | uuid | Foreign key to auth.users |
| name | text | Category name |
| type | text | 'income' or 'expense' |
| subcategories | jsonb | Array of subcategory names |
| color | text | Hex color code |
| icon | text | Icon name |

#### `accounts`
| Column | Type | Description |
|--------|------|-------------|
| id | text | Primary key |
| user_id | uuid | Foreign key to auth.users |
| name | text | Account name |
| type | text | 'cash', 'bank', 'digital', 'other' |
| currency | text | Currency code |
| color | text | Hex color code |
| initial_balance | numeric | Starting balance |
| icon | text | Icon name |
| order_index | integer | Display order |

#### `people`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Foreign key to auth.users |
| name | text | Person name |
| avatar | text | Avatar URL or emoji |
| color | text | Hex color code |
| default_currency | text | Default currency |
| balances | jsonb | Multi-currency balances |

#### `events`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Foreign key to auth.users (owner) |
| name | text | Event name |
| description | text | Event description |
| start_date | timestamp | Start date |
| end_date | timestamp | End date |
| person_ids | jsonb | Array of participant IDs |
| shared_emails | jsonb | Array of shared user emails |
| icon | text | Icon name |
| color | text | Hex color code |
| image_url | text | Event photo URL |
| status | text | 'active', 'completed', 'archived' |

#### `shared_expenses`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| event_id | uuid | Foreign key to events |
| name | text | Expense name |
| amount | numeric | Amount |
| currency | text | Currency code |
| paid_by | text | Person ID who paid |
| shared_with | jsonb | Array of person IDs |
| split_type | text | 'equal' or 'exact' |
| split_details | jsonb | Custom split amounts |
| date | timestamp | Expense date |
| category | text | Category name |

#### `settings`
| Column | Type | Description |
|--------|------|-------------|
| user_id | uuid | Primary key |
| base_currency | text | Default currency |
| theme | text | Theme name |
| language | text | 'en' or 'sr' |

---

## 4. Architecture Patterns

### 4.1 State Management
- **Local State**: React `useState` for component-level state
- **Global State**: Single `AppState` object in main App component
- **Persistence**: `localStorage` for offline data
- **Sync**: Supabase for cloud backup and multi-device sync

### 4.2 Data Flow
```
User Action → Component Handler → State Update → localStorage Save → Supabase Sync
```

### 4.3 Component Architecture
```
App (Main Container)
├── AuthView (Login/Signup)
├── DashboardView (Overview)
├── TransactionsView (List)
├── EventsView / EventDetailView (Shared Expenses)
├── CalendarView (Calendar)
├── Stats (Analytics)
└── SettingsView (Configuration)
```

### 4.4 Service Layer
- **storageService.ts**: Local storage operations, CSV export
- **supabaseService.ts**: All Supabase operations (auth, CRUD, storage)
- **currencyService.ts**: Currency conversion and rate fetching

---

## 5. Design System

### 5.1 Material Design 3 (M3) Tokens
The app uses CSS custom properties for M3 design tokens:
- `--md-sys-color-primary`, `--md-sys-color-secondary`, `--md-sys-color-tertiary`
- `--md-sys-color-surface`, `--md-sys-color-surface-container`, etc.
- `--md-sys-color-on-surface`, `--md-sys-color-on-primary`, etc.
- `--md-sys-elevation-1` through `--md-sys-elevation-5`

### 5.2 Theme System
11 themes defined in CSS, each with unique color schemes:
- Themes applied via class on `<html>` element
- Smooth transitions between themes (500ms)
- Dynamic glow effects based on theme colors

### 5.3 Typography
- **Font**: System font stack with Inter preference
- **Display Font**: For large numbers and headings
- **Sans Font**: For body text

### 5.4 Animation
- **Framer Motion**: Used for:
  - Page transitions (staggered children)
  - Card hover effects
  - Modal animations
  - Toast notifications
  - Button interactions

---

## 6. Key Features Deep Dive

### 6.1 Multi-Currency Support
- **Exchange Rate API**: Uses `exchangerate-api.com` for live rates
- **Conversion Logic**: Amount → Base Currency → Target Currency
- **Fallback**: Hardcoded default rates if API fails
- **Display**: All amounts can be displayed in user's base currency

### 6.2 Internal Transfers
- **Special Category**: `internal-transfer` excluded from income/expense calculations
- **Dual Transaction Creation**:
  1. Outflow transaction (expense) from source account
  2. Inflow transaction (income) to target account
- **Currency Conversion**: Automatic conversion between account currencies

### 6.3 Debt/Loan System
- **Balance Calculation**:
  - Expense linked to person = They owe you (+ balance)
  - Income linked to person = You owe them (- balance)
- **Settlement**: Creates transaction to zero out balance
- **Multi-currency**: Separate balances per currency

### 6.4 Shared Expenses
- **Event-based**: Expenses grouped under events
- **Split Types**:
  - Equal: Divide amount equally among participants
  - Exact: Custom amounts per person
- **Debt Calculation**: Automatic calculation of who owes whom

### 6.5 Receipt System
- **Itemized Receipts**: Store items with name, price, quantity
- **Merchant Info**: Store merchant name
- **Total Validation**: Compare receipt total with transaction amount

---

## 7. Strengths

1. **Comprehensive Feature Set**: Covers all major personal finance needs
2. **Beautiful UI**: Material Design 3 with smooth animations
3. **Multi-currency**: Excellent support for international users
4. **Offline-first**: Works without internet, syncs when available
5. **Mobile-ready**: Responsive design with Capacitor for native apps
6. **Shared Expenses**: Unique feature for group spending tracking
7. **Analytics**: Rich visualization of spending patterns
8. **Export Options**: CSV and PDF export for data portability
9. **AI Integration**: Ready for AI-powered insights
10. **Type Safety**: Full TypeScript coverage

---

## 8. Areas for Improvement

### 8.1 Code Organization
- **Large App.tsx**: 1288 lines, should be split into smaller components
- **Component Co-location**: Related components could be grouped better
- **Service Separation**: Some business logic in components

### 8.2 Performance
- **State Management**: Could benefit from Redux Toolkit or Zustand
- **Memoization**: Limited use of `useMemo` and `useCallback`
- **Bundle Size**: Many dependencies could be tree-shaken better

### 8.3 Testing
- **No Tests**: No unit tests, integration tests, or E2E tests
- **Test Coverage**: Unknown

### 8.4 Error Handling
- **Limited Error Boundaries**: Could have more robust error handling
- **User Feedback**: Some errors only logged to console

### 8.5 Documentation
- **Limited Comments**: Code lacks detailed documentation
- **No API Docs**: No documentation for service layer

### 8.6 Features
- **No Budgeting**: No budget tracking or limits
- **No Goals**: No savings goals
- **No Recurring Transactions**: No automatic recurring expenses
- **No Reports**: Limited reporting beyond analytics
- **No Notifications**: No alerts for budget overruns or due dates

---

## 9. Technical Debt

1. **Snake_case to camelCase Mapping**: Manual mapping in Supabase service
2. **Hardcoded Theme Classes**: Theme classes defined in CSS, not JS
3. **LocalStorage Version**: Manual versioning with storage key
4. **Migration Logic**: Inline migration code in multiple places
5. **Environment Variables**: Using Vite-specific naming (`VITE_` prefix)

---

## 10. Security Considerations

1. **RLS Policies**: Supabase Row Level Security for data isolation
2. **Edge Function**: User deletion via secure edge function
3. **API Keys**: Stored in environment variables
4. **Storage Policies**: Avatar and event photo access controlled

---

## 11. Deployment

- **Build**: `vite build` for production bundle
- **Preview**: `vite preview` for local preview
- **Capacitor**: Build native Android apps
- **Netlify**: Configured for deployment (netlify.toml)
- **PWA**: Service worker for offline support

---

## 12. Conclusion

The Finance app is a well-designed, feature-rich personal finance application with excellent UI/UX and comprehensive functionality. Its unique shared expenses feature sets it apart from many competitors. The multi-currency support and beautiful theming make it suitable for international users.

The main areas for improvement are code organization (splitting the large App.tsx), adding comprehensive testing, and implementing missing features like budgeting and recurring transactions. The app would also benefit from a more robust state management solution and better documentation.

Overall, this is a solid foundation for a production-ready finance application that could be further enhanced with the suggested improvements.
