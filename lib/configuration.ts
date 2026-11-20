import {z} from 'zod';

export const profileSchema=z.object({model:z.string().min(1).max(300),reasoningLevel:z.string().min(1).max(100),serviceTier:z.string().min(1).max(100)}).strict();
export const configurationSchema=z.object({version:z.literal(1),providerId:z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),primaryModel:z.string().min(1).max(300),profile:profileSchema,autoEnabled:z.boolean()}).strict();
export type Configuration=z.infer<typeof configurationSchema>;
export const providerSchema=z.object({id:z.string(),label:z.string(),usageSupported:z.boolean()});
export const modelSchema=z.object({model:z.string(),label:z.string(),reasoningLevels:z.array(z.object({id:z.string(),label:z.string()})),defaultReasoningLevel:z.string(),serviceTiers:z.array(z.object({id:z.string(),label:z.string()}))});
export const catalogSchema=z.object({providers:z.array(providerSchema),models:z.array(modelSchema),error:z.string().nullable()});
export type Catalog=z.infer<typeof catalogSchema>;

export function checkSelection(config:Configuration,catalog:Catalog){
 if(!catalog.providers.some(p=>p.id===config.providerId))throw Error('Choose an available provider.');
 if(catalog.error)throw Error(catalog.error);
 if(!catalog.models.some(m=>m.model===config.primaryModel))throw Error('Choose your main model from the current BB catalog.');
 const model=catalog.models.find(m=>m.model===config.profile.model);
 if(!model)throw Error('Choose a Downshift model from the same provider.');
 if(!model.reasoningLevels.some(level=>level.id===config.profile.reasoningLevel))throw Error('Choose a supported reasoning level.');
 if(!model.serviceTiers.some(tier=>tier.id===config.profile.serviceTier))throw Error('Choose a supported service tier.');
 if(config.autoEnabled&&config.providerId!=='codex')throw Error('Automatic activation needs verified quota semantics. This provider currently supports manual switching.');
}
