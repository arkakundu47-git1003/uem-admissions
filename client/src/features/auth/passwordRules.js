import { z } from 'zod';

// Same rules as the server (auth.routes.js) so users see the problem before submitting.
export const passwordRules = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/\d/, 'Include a number');
