import { router } from '@/server/trpc'
import { authRouter } from './routers/auth'
import { dashboardRouter } from './routers/dashboard'
import { contractsRouter } from './routers/contracts'
import { signatureFieldsRouter } from './routers/signature-fields'
import { templatesRouter } from './routers/templates'
import { billingRouter } from './routers/billing'
import { auditRouter } from './routers/audit'
import { contactsRouter } from './routers/contacts'

export const appRouter = router({
  auth: authRouter,
  dashboard: dashboardRouter,
  contracts: contractsRouter,
  signatureFields: signatureFieldsRouter,
  templates: templatesRouter,
  billing: billingRouter,
  audit: auditRouter,
  contacts: contactsRouter,
})

export type AppRouter = typeof appRouter
