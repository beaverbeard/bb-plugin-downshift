import {createHash} from 'node:crypto';
import type {Configuration} from './configuration';
export const policyId=(config:Configuration)=>'profile-'+createHash('sha256').update(JSON.stringify([config.providerId,config.profile.model,config.profile.reasoningLevel,config.profile.serviceTier])).digest('hex').slice(0,40);
