import DefaultTheme from 'vitepress/theme';
import './custom.css';
import LandingPage from './LandingPage.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LandingPage', LandingPage);
  },
};
