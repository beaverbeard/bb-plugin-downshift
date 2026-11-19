import {definePluginApp} from '@get-bb/plugin-sdk/app';
import {registerEconomyMode} from './control';
export default definePluginApp(app => {registerEconomyMode(app);});
