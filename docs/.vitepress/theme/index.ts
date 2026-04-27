import DefaultTheme from 'vitepress/theme';
import './custom.css';
import LandingPage from './LandingPage.vue';
import ProvenanceExplorer from './ProvenanceExplorer.vue';
import PapersStatusBoard from './PapersStatusBoard.vue';
import LiveEvidenceStrip from './LiveEvidenceStrip.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LandingPage', LandingPage);
    app.component('ProvenanceExplorer', ProvenanceExplorer);
    app.component('PapersStatusBoard', PapersStatusBoard);
    app.component('LiveEvidenceStrip', LiveEvidenceStrip);
  },
};
