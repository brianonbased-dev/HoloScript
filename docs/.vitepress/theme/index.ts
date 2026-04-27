import DefaultTheme from 'vitepress/theme';
import './custom.css';
import LandingPage from './LandingPage.vue';
import ProvenanceExplorer from './ProvenanceExplorer.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LandingPage', LandingPage);
    app.component('ProvenanceExplorer', ProvenanceExplorer);
  },
};
