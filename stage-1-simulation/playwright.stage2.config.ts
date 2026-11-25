import {defineConfig} from '@playwright/test';
import desktop from './playwright.config';

export default defineConfig({
  ...desktop,
  testIgnore:[],
  testMatch:'**/stage2.spec.ts',
  use:{...desktop.use,baseURL:'http://127.0.0.1:4182'},
  webServer:{
    command:'../stage-2-mixed-reality/launch.sh --host 127.0.0.1',
    url:'http://127.0.0.1:4182',
    reuseExistingServer:true,
  },
});
