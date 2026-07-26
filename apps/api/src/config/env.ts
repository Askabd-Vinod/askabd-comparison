import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();
const s = z.object({ NODE_ENV: z.enum(['development','production','test']).default('development'), PORT: z.coerce.number().default(4200), HOST: z.string().default('0.0.0.0'), DATABASE_URL: z.string().default('postgresql://comp_user:comp_local_pass@localhost:5442/comparison'), GATEWAY_URL: z.string().default('http://localhost:3000'), LOG_LEVEL: z.string().default('info') });
const p = s.safeParse(process.env); if (!p.success) { console.error(p.error.flatten().fieldErrors); process.exit(1); }
export const config = p.data;
