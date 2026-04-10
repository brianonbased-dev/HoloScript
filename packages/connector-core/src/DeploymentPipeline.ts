export interface DeploymentPipeline {
  /**
   * Compile the HoloScript project into the deployable artifact format.
   */
  compile(projectPath: string): Promise<string>;

  /**
   * Select the target quality tier and destination mapping.
   */
  selectTarget(tier: 'low' | 'med' | 'high' | 'ultra'): Promise<void>;

  /**
   * Push the unified artifact to the selected target environment.
   */
  deploy(artifact: string): Promise<string>;

  /**
   * Validate the health and success of the finished deployment.
   */
  verify(deploymentId: string): Promise<boolean>;
}
