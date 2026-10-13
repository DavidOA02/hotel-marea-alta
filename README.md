# Hotel Marea Alta · Paracas — v2 (Next.js + NestJS + PostgreSQL)

Hotel website with online reservations and a hotel management system featuring role-based authentication.

| Layer | Technologies | Directory |
|---|---|---|
| Public website + Admin panel | **Next.js 16.3** (App Router), **React 19**, **Tailwind 4**, **Zustand**, **TanStack Table 9**, **React Hook Form + Zod**, **react-pdf**, **Embla Carousel**, Recharts | `apps/web` |
| API | **NestJS 11**, **pg** (PostgreSQL), **ssh2** (optional SSH tunnel), JWT, **nodemailer** (emails) | `apps/api` |
| Shared business rules | **Zod** schemas, VAT (IGV), Peruvian identification documents, and hotel metrics | `packages/shared` |
| Testing | **Jest** + supertest against a real PostgreSQL database | `*/src/**/*.spec.ts`, `apps/api/test` |
| Database | PostgreSQL 14+ | `database` |
| Analytics | Power BI | `powerbi` |

> Practice project: Tax identification numbers (RUC), phone numbers, addresses, and testimonials are fictional. Photos are sourced from Unsplash.

---

## Getting Started (Windows)

**Requirements:** Node.js **20.9 or later** (`winget install OpenJS.NodeJS.LTS`) and PostgreSQL **14 or later** (`winget install PostgreSQL.PostgreSQL.17`). Remember the password assigned to the `postgres` user during installation.

Inside the `hotel-marea-alta` directory:

```bash
npm install          # Installs dependencies, builds @marea/shared, and creates .env files
npm run db:demo      # Creates the database with demo data (prompts for the PostgreSQL password if necessary)
npm run dev          # Starts the API on :4000 and the web application on :3000
```

- Web: http://localhost:3000
- Admin Panel: http://localhost:3000/panel
- API: http://localhost:4000/api/salud

| Role | Email | Temporary Password |
|---|---|---|
| Administrator | `admin@mareaalta.pe` | `Admin2026!` |
| Receptionist | `recepcion@mareaalta.pe` | `Recepcion2026!` |

Users must change their passwords upon their first login. The "Test Users" panel is displayed only on `localhost`.

### Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Runs the NestJS API in watch mode and Next.js web application simultaneously; executes `verificar` first |
| `npm run verificar` | Checks Node.js, dependencies, PostgreSQL, and available ports |
| `npm run db` / `npm run db:demo` | Creates an empty database or one populated with demonstration data (**deletes the previous database**) |
| `npm run db:migrar` | Applies `database/03_mejoras.sql` to the existing database **without deleting data**; can be executed repeatedly |
| `npm test` | Executes Jest unit tests for the shared package and API |
| `npm run test:e2e` | Runs API end-to-end tests against a dedicated PostgreSQL test database |
| `npm run lint` / `npm run lint:fix` | Runs static analysis for the web application, API, shared rules, and tools; the second command applies automatic fixes |
| `npm run sandbox:verificar -- --proveedor culqi` | Validates local sandbox configuration without contacting the provider; also supports `mercadopago`, `niubiz`, and `nubefact` |
| `npm run test:sandbox` | Tests the sandbox configuration validator's safeguards without credentials, network access, or PostgreSQL |
| `npm run tipos -w @marea/web` | Checks TypeScript types in the web application without compiling it |
| `npm run build` followed by `npm start` | Builds and starts the application in production mode |

ESLint uses Next.js/React rules for the frontend and TypeScript rules for the API and shared package.

Errors cause the command to fail. Recommendations concerning React effects and libraries incompatible with the React Compiler remain warnings.

The `any` type is permitted for SQL rows and external responses that do not yet have defined types.

---

## How Each Technology Fits into the Architecture

### Shared Zod Schemas: A Single Source of Truth

`packages/shared/src/schemas.ts` defines validation rules once.

In the browser, React Hook Form uses:

`zodResolver(reservaWebSchema)`

In the API, NestJS uses:

`new ZodPipe(reservaWebSchema)`

Validation rules include:

- Eight-digit DNI and Peruvian mobile numbers with the +51 country code.
- Mandatory passport information for VAT (IGV) exemption.
- Check-out dates must be later than check-in dates.
- Strong password requirements.

API validation errors are returned in the following structure:

```json
{
  "mensaje": "Validation message",
  "campo": "fieldName"
}
```

The form highlights the corresponding field.

### Next.js 16 + React 19 + Tailwind 4

**Public Website**

- Homepage featuring a full-screen carousel and search bar.
- Room listings with actual configured rates and prices in PEN (S/) or USD (US$).
- Gallery and testimonials with carousel functionality.
- Reservation form with real-time availability.
- My Reservation section, including online payments.
- Complaints Book (Law No. 29571) and Privacy Policy.

**Administration Panel (`/panel`)**

- Dashboard.
- Front desk and reception management.
- Reservations.
- Room management with floor-based boards.
- Customers.
- Housekeeping.
- Maintenance.
- Shift-based cash management and reconciliation.
- Electronic invoices and receipts.
- Reports.
- Room rates.
- Complaints.
- Users.
- Audit logs.
- My Account.

**Tailwind CSS 4**

The theme is configured using `@theme`, while custom utilities are declared through `@utility`.

In Tailwind 4, this replaces the previous approach of using `@apply` within `@layer components`.

### Zustand

- `stores/sesion.ts`: Stores the administration panel session in `sessionStorage`, automatically renews authentication tokens, and logs users out after receiving an HTTP 401 response.
- `stores/reserva.ts`: Manages the selected currency and shared reservation draft between the homepage search bar and reservation form.
- `stores/avisos.ts`: Manages notifications.

Additional lightweight stores allow users to open reservation details, payment dialogs, new reservation forms, and confirmation dialogs from anywhere in the interface.

### TanStack Table 9

`components/panel/tabla.tsx` explicitly registers features such as:

- `rowSortingFeature`
- `globalFilteringFeature`
- `rowPaginationFeature`

It also registers the corresponding row models, as required by version 9.

Table functionality includes:

- Sorting by any column, including `aria-sort` accessibility attributes.
- Global search filtering.
- Pagination.
- Exporting filtered records to CSV.
- Opening rows using the Enter key.
- Displaying rows as cards on mobile devices.

### react-pdf

`components/pdf/confirmacion.tsx` generates the **reservation confirmation PDF** directly in the browser.

- Guests can download the document immediately after making a reservation.
- Guests can download it again from My Reservation.
- Receptionists can download it from the reservation details screen.

The library is loaded only when the user clicks the PDF download button.

### NestJS 11 + pg

Database operations use parameterized SQL queries through `pg`, located at:

`apps/api/src/db/db.service.ts`

The implementation supports camelCase results and database transactions.

**Double-booking prevention uses three layers:**

1. A PostgreSQL advisory lock based on room type ensures that simultaneous reservations for the same category are processed sequentially.
2. A PostgreSQL `EXCLUDE USING gist` constraint prevents overlapping room reservations even if other safeguards fail.
3. The API automatically retries operations when a concurrency conflict occurs.

**Security mechanisms include:**

- JWT access tokens valid for one hour, with a 12-hour refresh period.
- A session validation stamp that invalidates existing sessions whenever a password, role, or account status changes.
- Account lockout after five failed login attempts.
- IP-based request rate limiting.
- Password hashing using PBKDF2-SHA256.

### ssh2: Optional SSH Tunnel

If PostgreSQL is hosted on a VPS that can only be accessed through SSH, configure the following variables in `apps/api/.env`:

```env
SSH_HOST=mi-vps.ejemplo.pe
SSH_USUARIO=deploy
SSH_LLAVE=C:\Users\tu-usuario\.ssh\id_ed25519
```

The API establishes the SSH tunnel using `ssh2` and connects to `PGHOST:PGPORT` from the server without exposing PostgreSQL directly to the Internet.

### Jest

**Shared package tests (`packages/shared`)**

- Room rates and VAT (IGV).
- Price recalculation after room changes.
- Identification document validation.
- Business-day calculations.
- Hotel metric prorating.
- Zod schemas.

**API unit tests (`apps/api`)**

- Password handling.
- Cancellation policies.
- Integration contracts using mocked `fetch` requests:
  - Culqi with 3-D Secure and refunds.
  - Mercado Pago webhook signature validation and refunds.
  - Niubiz.
  - Nubefact credit notes.

**API end-to-end tests (`apps/api/test`)**

These tests run against a real PostgreSQL database.

They read `apps/api/.env` and force simulated integration modes, ensuring that no actual emails are sent and no real payments are processed.

Test scenarios include:

- Reservations, validation rules, and the Complaints Book.
- Role-based permissions, account lockout, and session renewal.
- Walk-in → payment → check-out.
- Payment cancellations and room/customer CRUD operations.
- **Concurrency:** Six guests attempt to reserve four suites simultaneously. Exactly four reservations must succeed, without overlapping bookings.
- Queued emails and escaped HTML templates.
- Room changes, including in-house guests without false overlap conflicts.
- **Idempotent online payments:** Duplicate or simultaneous notifications must produce only one payment record.
- Electronic receipts, invoices, and exports with **gap-free sequential numbering**, even during concurrent issuance.
- Immutable audit logs.
- Partial and full credit notes.
- Manual and payment-gateway refunds.
- Discounts with automatically generated credit notes.
- Complete Culqi 3-D Secure flows using a simulated Culqi API.
- Duplicate-free reminders and surveys.
- NPS calculations and email management screens.
- Shift-based cash management:
  - Payments through any payment method require an open shift.
  - Expected cash balances in PEN and USD.
  - USD refunds using the original payment exchange rate.
  - Withdrawals cannot exceed expected cash.
  - Reconciliation differences require mandatory explanations.
  - One-time administrator reviews.
  - Immutable reconciliations.
  - **Simultaneous shift closing and payment processing:** Each payment must either be included in the reconciliation or rejected.
- Housekeeping and maintenance:
  - Check-out automatically schedules departure cleaning, prioritized according to upcoming arrivals.
  - Only one open cleaning task per room.
  - Reported defects generate maintenance orders.
  - Maintenance blocks remove rooms from public availability, the administration panel, and room reassignment options.
  - Extensions of maintenance blocks are checked against existing reservations.
  - **Simultaneous maintenance blocking and reservation of the final available suite:** Only one operation may succeed.

---

## Shift-Based Cash Management and Reconciliation

Each receptionist or administrator is responsible for the cash handled during their shift.

### Opening a Shift

Navigate to:

**Cash and Payments → Open Shift**

Alternatively, open the shift directly from the payment interface.

The cashier counts the **opening cash float** used to provide change.

Each user may have only one open shift at a time.

### Payments

Every payment registered through the administration panel requires an open shift belonging to the user processing it.

Supported payment methods include:

- Cash.
- Credit or debit card.
- Yape.
- Plin.
- Bank transfer.

This ensures that shift reconciliation includes all payment methods and can be compared against POS transactions, Yape transactions, and bank movements.

Online payments do not belong to a cashier shift.

### Manual Refunds

Manual refunds are associated with the shift of the employee issuing them.

Cash refunds require an open shift and cannot exceed the expected cash balance.

Payments originally received in USD must be refunded in USD using the exchange rate recorded at the time of payment.

When the remaining refundable amount is returned in full, the system must issue exactly the remaining USD amount.

### Cash Deposits and Withdrawals

Examples include:

- Transfers to the hotel safe.
- Additional change received.
- Other cash inflows or outflows.

Transactions may be recorded in PEN or USD.

Withdrawals cannot exceed the expected available cash.

Transactions cannot be deleted. Incorrect transactions must be corrected through a reversing entry.

### Expected Cash Balance

The calculation is:

**Expected Cash = Opening Float + Cash Payments − Cash Refunds + Cash Deposits − Cash Withdrawals**

USD balances are calculated separately without currency conversion.

### Closing a Shift

During reconciliation, the employee counts:

- Banknotes.
- Coins.
- Total PEN cash.
- Total USD cash.

Alternatively, the total counted amount may be entered directly.

The system stores:

- Expected amount.
- Counted amount.
- Difference (shortage or surplus).

If a difference exists, an explanation is mandatory.

The shift report can be printed and includes signature spaces for the employee handing over the cash and the employee receiving it.

### Administrator Review

Administrators can view all shifts under:

**Shifts and Reconciliations**

Each reconciliation may be marked as reviewed only once.

Administrators may also review their own reconciliations, which is useful when the hotel has only one administrator.

The notification bell alerts administrators about:

- Unreviewed reconciliations with discrepancies.
- Shifts that have remained open for more than 12 hours.

### Data Integrity

Closed reconciliations are immutable.

PostgreSQL triggers reject:

- Unauthorized changes.
- Deletions.
- Payments associated with closed shifts.
- Refunds associated with closed shifts.
- Cash movements associated with closed shifts.

The only permitted modification is the administrator review status.

If a payment is canceled after its shift has been closed, the stored reconciliation remains unchanged.

The report additionally displays what the expected balance would be based on current records.

### Audit Logging and Power BI

Shift opening, movements, closing, and review operations are recorded in the audit log.

The following views support Power BI:

- `vw_turnos_caja_powerbi`: Summarizes each cashier shift.
- `vw_pagos_powerbi`: Includes the `turno_id` field.

For an existing database, execute:

```bash
npm run db:migrar
```

Previous payments remain unassigned to a shift.

The demonstration database includes one week of closed receptionist shifts, including a reviewed shortage and a pending surplus.

---

## Housekeeping and Maintenance

### Housekeeping (`/panel/limpieza`)

**Daily Cleaning Plan**

Each room displays its required cleaning activity:

- Departure cleaning.
- Daily housekeeping service.
- Deep cleaning.

The system also displays:

- Assigned cleaning staff.
- Task creation or assignment time.
- Cleaning progress.

**Priority order:**

1. Dirty rooms with guests arriving today.
2. Other rooms awaiting cleaning.
3. Daily housekeeping for occupied rooms.

**Cleaning statuses:**

To Clean → Cleaning in Progress → Clean

Each task records:

- Name of the person performing the cleaning (a panel user account is not required).
- Start time.
- Completion time.

**Automatic task creation**

A departure cleaning task is automatically scheduled when:

- A guest checks out.
- An in-house guest changes rooms.

Completing a maintenance order schedules deep cleaning.

**Damage Reporting**

Housekeeping staff may record defects discovered while completing a cleaning task.

The system automatically creates a maintenance order for the affected room.

Only one open cleaning task is allowed per room.

The quick "Clean" action in the room board and reception interface completes the currently open cleaning task.

The daily housekeeping sheet can be printed for the cleaning staff.

During check-in, the system warns reception if the assigned room is still marked as "To Clean" or "Cleaning in Progress."

### Maintenance (`/panel/mantenimiento`)

**Maintenance Orders**

Orders may be created for individual rooms or common areas such as:

- Swimming pool.
- Lobby.
- Other hotel facilities.

Each order contains:

- Category.
- Priority: low, medium, high, or urgent.
- Assigned technician or external provider.
- Status: pending, in progress, resolved, or canceled.
- Resolution details.
- Cost.

### Date-Based Room Blocking

An open maintenance order may block a room from a specified start date until the date when it becomes available for sale again.

While blocked, the room:

- Does not appear in public website availability.
- Cannot be assigned through panel reservations.
- Cannot be selected during room changes.

**Reservation protection**

- Nights already covered by confirmed reservations cannot be blocked.
- Existing bookings must first be reassigned through their reservation details.
- Extending or moving a maintenance block triggers another availability validation.

Maintenance blocking uses the same room-type advisory lock as reservations.

Therefore, a simultaneous booking and maintenance block cannot overlap.

When the maintenance order is resolved or canceled, the blocking period ends that day, and the room becomes available again.

### Room Board and Notifications

The room board identifies open maintenance orders and displays "Maintenance" when a room is blocked for the current day.

The notification bell alerts users about:

- Urgent maintenance orders.
- Dirty rooms with guests arriving today.

### Audit Logging and Power BI

Housekeeping tasks and maintenance orders are recorded in the audit log.

The view:

`vw_mantenimiento_powerbi`

summarizes:

- Maintenance resolution time in days.
- Blocked nights.
- Cost per maintenance order.

For databases containing existing data, run:

```bash
npm run db:migrar
```

The demonstration database includes:

- Daily cleaning tasks.
- A room blocked due to an air-conditioning issue.
- A swimming pool maintenance order.
- A completed repair.

---

## Emails, Online Payments, Refunds, Electronic Invoicing, Room Changes, Surveys, and Audit Logs

All functionality works in development **without real provider credentials**.

In development mode:

- Emails are recorded as "Simulated."
- The payment gateway operates in simulation mode with "Approve" and "Reject" buttons.
- The simulated Electronic Services Operator (OSE) accepts electronic tax documents without legal or tax validity.

Simulation modes are automatically disabled in production.

Environment variables are documented in:

`apps/api/.env.ejemplo`

When the API starts, it displays which integrations are active.

If the database already contains records, run:

```bash
npm run db:migrar
```

This migration preserves existing data.

### Automatic Emails (`apps/api/src/correo`)

**Email triggers**

- **Reservation created:** Sends the reservation confirmation for bookings made through the website or administration panel.
- **Reservation canceled:** Sends the cancellation notification.
- **Online payment or refund:** Sends the corresponding payment or refund receipt.
- **Electronic document accepted:** Sends the accepted receipt, invoice, credit note, or debit note.
- **Two days before arrival:** Sends a reminder with the check-in time, directions, outstanding balance, and required identification documents. The reminder is not sent if the reservation was made only one day before arrival.
- **Between two hours and three days after check-out:** Sends the guest satisfaction survey.
- **Complaints Book:** Sends the complaint registration acknowledgment and the administrator's official response.

### Email Outbox

The `correos` table stores outgoing messages.

Email records are created within the same database transaction as the operation that generates them.

A background processing service sends them using SMTP through `nodemailer`.

Failed delivery attempts are retried after:

- 1 minute.
- 5 minutes.
- 15 minutes.
- 60 minutes.

An unavailable email server must never cause a reservation operation to fail.

### Scheduled Emails

`programados.service.ts` runs every 30 minutes.

A unique database index guarantees that each reservation receives:

- Only one arrival reminder.
- Only one satisfaction survey.

This guarantee applies even when multiple API instances run simultaneously.

Scheduled emails can be disabled using:

```env
CORREOS_PROGRAMADOS=false
```

### Emails Management Screen

The "Emails" interface includes:

- A complete outbox with filters.
- Error details for failed messages.
- Email previews displayed inside an isolated `iframe` without scripts.
- Individual retry functionality.
- Bulk retry for failed emails.

The administration panel notification bell warns about:

- Failed emails.
- Messages queued for more than 30 minutes.

Reservation details and complaint records display the delivery status of their associated emails.

Reception staff can resend reservation confirmations directly from reservation details.

All user-provided information is HTML-escaped within email templates to prevent HTML injection.

### Multilingual Email Support

The following email types are available in Spanish and English:

- Reservation confirmation.
- Cancellation.
- Payment.
- Refund.
- Reminder.
- Survey.
- Electronic tax documents.

Language preferences can be selected in:

- Public reservation forms.
- Administration panel customer registration.
- Customer details.

The "Automatic" option selects:

- English for guests residing abroad.
- Spanish for guests residing in Peru.

Residence information and VAT exemption eligibility remain separate from language preferences.

The Complaints Book has its own language selector for acknowledgments and responses.

Any text entered by an administrator must remain unchanged.

---

### Online Payments (`apps/api/src/pagos-en-linea`)

**Payment flow**

My Reservation or Reservation Confirmation → **Pay Online** → `/pago`

Each payment attempt creates an order with an unpredictable identifier.

The API determines the payment amount using the reservation's outstanding balance.

The payment result must always be verified directly with the payment gateway, never trusted solely from browser responses.

### Supported Payment Gateways

Configured through:

`PASARELA=...`

**Culqi**

Culqi Checkout Custom tokenizes payment cards or Yape information in the browser.

The API then creates the payment charge using the secret key.

**3-D Secure flow**

`Culqi3DS` generates a device fingerprint, which is included in the payment request.

If the fraud prevention system returns `REVIEW`, no charge has been completed.

The browser authenticates the cardholder through their bank.

The API then retries the charge using the same token and the required 3DS parameters, including:

- `eci`
- `cavv`
- `xid`

**Mercado Pago**

Uses Checkout Pro through a redirect-based payment flow.

Payment confirmation is performed by querying:

`/v1/payments`

Verification occurs when the guest returns from the gateway and when the webhook is received at:

`POST /api/webhooks/mercadopago`

The webhook validates the `x-signature` header.

**Niubiz**

Uses a web payment button.

The workflow is:

1. Request a security token.
2. Create a payment session.
3. Display the Niubiz payment form.
4. Receive the `transactionToken`.
5. Send the token to the API.
6. Authorize the transaction, expecting `ACTION_CODE 000`.
7. Redirect the guest back to the hotel website.

### Payment Idempotency

If the payment gateway sends multiple notifications through redirects and webhooks, the transaction is recorded only once.

An approved payment is recorded even when its associated payment order has expired.

The reservation is locked while a payment is being registered.

This prevents simultaneous payments from the website and reception from exceeding the reservation balance.

If an overpayment still occurs, it is recorded in the audit log for subsequent reimbursement.

---

### Refunds (`apps/api/src/pagos/devoluciones.service.ts`)

Refunds are managed through:

Reservation Details → Payment → **Refund**

Only administrators may perform this action.

### Refund Methods

**Culqi, Mercado Pago, and Niubiz**

Full or partial refunds are requested through the respective provider API.

Mercado Pago uses an idempotency key to prevent duplicate refunds during retries.

**Niubiz**

Registering a refund creates a pending refund request.

The API queries its status every five minutes.

The status may also be refreshed manually from the reservation details screen.

Only the successful status `S` reduces the recorded payment balance and triggers the notification email.

If authentication fails before registration, the operation can be retried.

If the registration response is lost, the system must never repeat the original POST request automatically.

Instead, a "Reconcile" option allows the administrator to enter the confirmed Niubiz refund code.

The system validates that:

- The transaction matches.
- The refund amount matches.

The integration uses the issuer's RUC through:

`HOTEL_RUC`

It requires a settled transaction and access to the provider's refund APIs.

**Cash, bank transfers, Yape, and other manual methods**

Hotel staff return the money through the corresponding payment method and register the refund in the system.

### Net Paid Amount

The amount paid toward a reservation is calculated as:

**Net Paid = Approved Payments − Completed Refunds**

This calculation is centralized in the SQL function:

`pagado_neto`

It is used by:

- Reservation details.
- Cash management.
- Dashboard.
- Reports.
- Power BI.

### Discounts and Unused Nights

When lowering the total reservation amount:

- The system reduces the reservation total.
- If an accepted electronic receipt or invoice already exists, a credit note is generated **within the same database transaction**.

### Cash Management Integration

The cash management module displays:

- Refunds for the selected period.
- Net collected amounts.

If the payment gateway does not respond, the refund remains "Pending" and may be retried.

Payments with existing refunds cannot subsequently be voided.

---

### SUNAT Electronic Invoicing (`apps/api/src/facturacion`)

Electronic documents may be issued once a reservation has been fully paid.

Navigate to:

Reservation Details → **Issue**

### Supported Electronic Documents

**Sales Receipt (Boleta)**

Uses the guest's:

- DNI.
- Foreigner Identification Card (CE).
- Passport.

**Invoice (Factura)**

Requires:

- RUC.
- Registered business name.
- Business address.

**Accommodation Service Export Invoice**

For qualifying nonresident foreign guests exempt from VAT (IGV):

- Service export operation code `0202`.
- Tax affectation code `40`.
- Passport identification.

### Sequential Numbering

Documents use sequential numbering by series through:

`series_comprobante`

The implementation prevents gaps and duplicate numbers, including when multiple workstations issue documents concurrently.

Each reservation can have only one active electronic tax document.

Rejected and canceled documents do not count as active documents.

### Electronic Services Operator (OSE)

Configured through:

`FACTURACION=nubefact`

Nubefact:

1. Generates UBL 2.1 XML.
2. Digitally signs the document.
3. Submits it to SUNAT.

Sales receipts remain "Pending" until the daily summary is processed.

A scheduled process checks pending documents every five minutes.

Users may also click "Refresh Status."

Once accepted, the electronic document is emailed to the customer with links to its PDF and XML versions.

### Document Cancellation

Only administrators may submit a cancellation communication.

Cancellation is permitted up to seven days after issuance, provided the document has no associated credit notes.

### Credit Notes

Available to administrators through:

Reservation Details or Electronic Documents → **Credit Note**

**Supported reasons (SUNAT Catalog 09)**

- `01`: Cancellation of the transaction.
- `02`: Incorrect RUC (invoices only).
- `06`: Full refund.
- `09`: Reduction in value.

**Credit note numbering**

- `BC01` for sales receipts.
- `FC01` for invoices.

Each credit note modifies only one electronic document, in accordance with the SUNAT requirements applicable since August 2026.

**Full credit notes (01, 02, 06)**

When accepted, the original document is marked as neutralized through:

`anulado_con_nota_id`

The original document remains valid in SUNAT, but the credit note offsets its value in the sales register.

A replacement document may then be issued, for example, with the corrected RUC.

**Partial credit notes (09)**

Reduce the reservation total.

If SUNAT rejects the credit note, the reduction is reversed.

Credit notes do not automatically transfer money.

Actual refunds must be processed through the corresponding payment record.

### Electronic Documents Screen

The "Electronic Documents" section provides:

- Date-filtered sales records.
- Credit notes deducted from totals.
- Taxable sales totals.
- Export service totals.
- VAT (IGV) totals.
- CSV export.

Power BI uses:

`vw_comprobantes_powerbi`

Including the `total_neto` column.

---

### Additional Charges and Debit Notes

Additional charges are managed through:

Reservation Details → **Additional Charges** → **Add Charge**

Available categories include:

- Restaurant.
- Bar.
- Tour.
- Minibar.
- Late check-out.
- Other services.

Each charge includes:

- Description.
- Quantity.
- Unit price in PEN, including VAT (IGV).

Additional charges increase the reservation total and outstanding balance.

Payment processing, cash management, and reports use the updated total.

Additional services remain subject to VAT even when accommodation qualifies as a service export.

The electronic document retains both tax bases and displays each additional charge as a separate line item.

### Before Electronic Document Issuance

Reception staff may add additional charges.

Administrators may cancel charges by providing a reason.

Documented charge records are preserved.

When a room change triggers a price recalculation, only the accommodation component is recalculated; additional charges remain unchanged.

### After Electronic Document Issuance

If an accepted invoice or sales receipt already exists, adding a new charge:

- Requires administrator authorization.
- Automatically generates a debit note reflecting the value increase.

If the original document is pending, the system must wait for its response.

### Direct Debit Note Issuance

Administrators can also issue debit notes directly through Reservation Details or Electronic Documents.

Supported SUNAT reasons:

- `01`: Late-payment interest.
- `02`: Value increase.
- `03`: Penalties.

Each debit note references one accepted and currently valid invoice or sales receipt.

A debit note cannot modify another note.

### Debit Note Numbering

Dedicated series:

- `BD01` for sales receipts.
- `FD01` for invoices.

Configurable through:

- `SERIE_ND_BOLETA`
- `SERIE_ND_FACTURA`

Once issued, the debit note:

- Increases the outstanding balance.
- Increases the total in the sales register.
- Appears in CSV exports.
- Appears in Power BI.
- Is emailed to the customer when accepted.

If the OSE rejects the debit note, the associated charge is reversed and the linked additional charge is canceled.

A document with active debit notes cannot be canceled or fully neutralized through a full credit note using this workflow.

Partial credit notes remain available against the original document amount.

---

### Changing Rooms During an Active Reservation

Available through:

Reservation Details → **Change Room**

This functionality applies to:

- Confirmed reservations.
- Guests currently staying at the hotel.

### Available Room Options

The system displays only rooms that:

- Are available for the remaining nights.
- Have sufficient guest capacity.

### Rate Options

**Keep Existing Rate**

Used for:

- Courtesy upgrades.
- Maintenance-related changes.
- Guest relocation.

**Recalculate Rate**

- Previously used nights retain their original prices.
- Remaining nights use the new room rate.
- Recalculation is not permitted once an electronic tax document has been issued.

### Guests Currently Staying at the Hotel

Room changes take effect from the current date.

The reservation records:

`habitacion_desde`

The PostgreSQL anti-overlap constraint considers only the applicable room assignment period.

Consequently, previous nights do not block the newly assigned room.

The previous room is automatically marked as "To Clean."

### Room Change History

Changes are recorded in:

`cambios_habitacion`

They are also included in the audit log, together with the reason for the change.

---

### Guest Satisfaction Survey

After check-out, the guest receives an email containing a unique, unpredictable link:

`/encuesta?token=...`

The survey may be submitted only once.

### Survey Questions

- Overall rating from 1 to 5.
- Recommendation score from 0 to 10.
- Optional written comment.

### Results

Available under:

Reports → **Guest Satisfaction**

Accessible only to administrators.

Metrics include:

- Average rating.
- Rating distribution.
- Response rate.
- Net Promoter Score (NPS).
- Latest guest comments.

**NPS calculation**

Promoters are guests who score 9–10.

Detractors are guests who score 0–6.

NPS is calculated as the percentage of promoters minus the percentage of detractors.

---

### Audit Log (`apps/api/src/auditoria`)

The system records:

- Who performed an operation.
- What operation was performed.
- When it occurred.
- The originating IP address.

### Logged Events

**Authentication**

- Successful logins.
- Failed login attempts.
- Account lockouts.

**Reservations and Payments**

- Reservation creation and modification.
- Payments.
- Payment cancellations.
- Check-outs with outstanding balances.
- Room changes.

**Rates**

- Previous price.
- Updated price.

**Data Management**

- Room changes.
- Customer changes.
- User changes.
- Modified fields.

**Financial Operations**

- Refunds.
- Credit notes.

**Other Events**

- Submitted satisfaction surveys.
- Complaints.
- Electronic documents.
- Resent emails.

### Audit Logging Implementation

The current user and IP address are obtained from a request-level context using:

`AsyncLocalStorage`

Audit records are written **within the same database transaction** as the associated operation.

### Append-Only Protection

A PostgreSQL trigger rejects:

- `UPDATE`
- `DELETE`
- `TRUNCATE`

Passwords are never stored in the audit log.

Only the fact that a password was reset is recorded.

### Audit Log Interface

The "Audit Log" screen is accessible only to administrators.

It provides:

- Search and filtering.
- Detailed event information.
- Previous and updated values.
- CSV export.

Each reservation details screen also displays its own activity history.

---

## Before Production Deployment

The real provider integrations were implemented according to official documentation.

Their integration contracts have been tested using mocked `fetch` requests.

**However, they have not yet been validated against the actual provider services.**

All integrations must be tested using each provider's official sandbox environment before production deployment.

### Niubiz

- Anti-fraud `MDD` fields are defined by Niubiz for each merchant. Adjust them in `pasarelas.ts`.
- Enable the refund APIs.
- Test refund registration, status queries, and reconciliation using settled transactions.
- The provider documents different sandbox hosts for refund registration and status queries.

These can be configured through:

- `NIUBIZ_DEVOLUCIONES_URL`
- `NIUBIZ_CONSULTA_DEVOLUCIONES_URL`

### Culqi

Test 3-D Secure using the official test cards that require cardholder authentication.

Culqi documentation contains conflicting information regarding the HTTP status code returned for charges requiring 3DS (200 or 201).

Therefore, the API determines the workflow from the response body:

- `object: "charge"`
- `action_code: "REVIEW"`

### Nubefact

Use the DEMO account to verify export invoice fields:

- `sunat_transaction`
- `tipo_de_igv`
- `total_inafecta`

Also verify credit note fields:

- `tipo_de_comprobante: 3`
- `documento_que_se_modifica_*`
- `tipo_de_nota_de_credito`
- Supporting explanation in `observaciones`

These fields are defined in:

`proveedores.ts`

Register credit note series in Nubefact:

- `SERIE_NC_BOLETA`
- `SERIE_NC_FACTURA`

Register debit note series as well:

- `SERIE_ND_BOLETA`
- `SERIE_ND_FACTURA`

Validate debit note parameters:

- `tipo_de_comprobante: 4`
- `tipo_de_nota_de_debito`

Also verify invoices containing both taxable and exported service line items.

Confirm the correct tax treatment of accommodation services provided to nonresident guests with a qualified accountant.

### Mercado Pago

Requires:

`API_URL_PUBLICA`

This must be configured with a publicly accessible HTTPS URL for webhooks.

### Scheduled Emails

If the demo database is created using:

```bash
npm run db:demo
```

and SMTP is configured, the system could attempt to send reminders and surveys to fictional email addresses.

To prevent this, configure:

```env
CORREOS_PROGRAMADOS=false
```

---

## Branding

The original logo represents the sun setting over the Pacific Ocean.

Its visual elements include:

- A sunset sky featuring gold, peach, and coral tones.
- Two flowing lines representing the sea breeze.
- The sun's reflection across the ocean.
- A golden circular frame.

### Brand Assets

All files are located in:

`apps/web/public/marca/`

| File | Purpose |
|---|---|
| `logotipo.svg` / `logotipo-claro.svg` | Full logo with hotel name, optimized for light and dark backgrounds; used in documents, signatures, and printed materials |
| `isotipo.svg` / `isotipo-512.png` | Standalone symbol for social media and stamps |
| `isotipo-mini.svg` | Simplified version for small sizes; used as the favicon |

The component:

`<Emblema />`

located at:

`apps/web/src/components/logo.tsx`

renders the logo using the same geometry.

The reservation confirmation PDF reproduces the same emblem using react-pdf.

### Tour Photography

Tour photographs are stored in:

`apps/web/public/img/tours/`

Images use optimized WebP format, with a combined size of approximately 630 KB.

Before publishing the website, verify that you have the necessary rights to use each photograph.

---

## Accessibility

The project was audited using axe-core against **WCAG 2.1 AA** accessibility requirements on desktop and mobile devices.

The audit covered:

- 10 public pages.
- 30 administration panel screens, including sections, modals, reservation details, and guides.

No accessibility errors were detected.

Implemented accessibility features include:

- Minimum text contrast ratio of 4.5:1.
- Properly associated form labels.
- Accessible error announcements.
- Native `<dialog>` elements with focus trapping and Escape-key support.
- Carousel controls supporting pause, keyboard navigation, and reduced-motion preferences.
- Complete keyboard navigation.

Keyboard shortcuts include:

- `/` to open the search interface.
- Enter to open table rows.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `npm run db` cannot connect | PostgreSQL may not be installed or its service may be stopped. Open `services.msc` and locate `postgresql-x64-...` |
| "The postgres password is incorrect" | Enter the password configured during installation. The script stores it in `apps/api/.env` |
| Login displays "Could not connect to the API" | Run `npm run dev` and verify that http://localhost:4000/api/salud responds |
| "Port 3000/4000 is already in use" | Close the other terminal window running `npm run dev` |
| CORS error | Add the appropriate URL to `CORS_ORIGENES` in `apps/api/.env` |
| "Your session was closed due to inactivity" | The session was inactive for 30 minutes. Adjust `NEXT_PUBLIC_PANEL_INACTIVIDAD_MIN` in `apps/web/.env.local` |
| `relation "bitacora" does not exist`, `function pagado_neto does not exist`, or missing tables such as `devoluciones`, `encuestas`, `turnos_caja`, `limpiezas`, or `mantenimientos` | The database predates the latest improvements. Run `npm run db:migrar` |
| "Open your cashier shift before processing payments" | Navigate to Cash and Payments → Open Shift, and enter the opening cash float. The button is also available during payment processing |
| Notification bell reports failed emails | Open Emails, inspect the error (invalid address, SMTP rejection, etc.), and click Retry |
| Emails are marked as "Simulated" | `SMTP_HOST` is missing from `apps/api/.env`. Emails are stored but not delivered |
| The "Pay Online" option is missing | Check `PASARELA` and its credentials. The API displays the active payment gateway during startup |
| `npm run test:e2e` fails because of the PostgreSQL password | Tests read `apps/api/.env`. Run `npm run db` first to save the password |

---

## Deployment

### Frontend

The Next.js application can be deployed to:

- Vercel.
- Another hosting provider supporting Node.js.

Configure:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WHATSAPP`

### Backend API

The NestJS API can be deployed to:

- A VPS.
- Render.

**Required security configuration**

Define:

- `JWT_SECRETO`
- `JWT_SECRETO_RENOVACION`

Both must contain long, randomly generated secret values.

The API will not start in production without these secrets.

**Database and CORS configuration**

Define:

- `PG*` environment variables.
- `CORS_ORIGENES`

**Additional integration configuration**

Define:

- `WEB_URL`
- `API_URL_PUBLICA`
- `SMTP_*`
- `PASARELA` and its provider credentials.
- `FACTURACION` and its Nubefact credentials.

When:

```env
NODE_ENV=production
```

the simulated payment gateway and simulated OSE are disabled.

### Reverse Proxy Configuration

`TRUST_PROXY` defines how many reverse proxies are located in front of the API.

Default value:

```env
TRUST_PROXY=1
```

For deployments behind Render or nginx, keep the value at `1`.

If the API receives client connections directly without a reverse proxy, configure:

```env
TRUST_PROXY=false
```

Incorrect configuration may allow users to spoof their IP addresses using `X-Forwarded-For`.

This could allow attackers to bypass rate limits and produce incorrect IP information in the audit logs.

### Database Hosting

Any PostgreSQL 14+ provider may be used, provided the database account has permission to execute:

```sql
CREATE EXTENSION btree_gist;
```

### Production User Accounts

Change all default and temporary passwords before the system goes live.

---

## Integration References

### Sandbox Testing Guide

`docs/pruebas-sandbox.md`

Covers:

- Required credentials.
- Separate sandbox database.
- Selecting `.env.sandbox`.
- Payment testing.
- Refund testing.
- Electronic document testing.

Local environment-variable validation does not replace actual testing against the provider's sandbox services.

### Niubiz

**Individual Refund Registration API**

https://desarrolladores.niubiz.com.pe/docs/api-de-registro-individual-copy

**Refund Status Query API**

https://desarrolladores.niubiz.com.pe/docs/api-de-consulta-devolución-copy

### Nubefact

**Official Integration Documentation and JSON Manual for Invoices, Sales Receipts, and Credit/Debit Notes**

https://www.nubefact.com/integracion