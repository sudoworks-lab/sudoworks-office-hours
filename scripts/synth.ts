import { App } from "aws-cdk-lib";
import { OfficeHoursStack } from "../infra/office-hours-stack.ts";

const outputDirectory = "dist/cdk.out";
const app = new App({
  outdir: outputDirectory,
  postCliContext: { "aws:cdk:disable-creation-stack-traces": true },
  stackTraces: false,
});
new OfficeHoursStack(app, "SudoWorksOfficeHours", {
  description: "Unapplied Office Hours reference architecture: CloudFront, S3, API Gateway, Lambda, and DynamoDB.",
});
const assembly = app.synth();
process.stdout.write(`CDK cloud assembly synthesized to ${assembly.directory}. No deployment was performed.\n`);
