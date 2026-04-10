import { detectFormat } from './src/utils/format';
console.log(
  detectFormat(`composition "SocialScene" {
  environment {
    skybox: "gradient"
  }
}`)
);
