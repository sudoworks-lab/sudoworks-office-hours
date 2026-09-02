#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { OfficeHoursStack } from "./office-hours-stack.ts";

const app = new App({
  postCliContext: { "aws:cdk:disable-creation-stack-traces": true },
  stackTraces: false,
});
new OfficeHoursStack(app, "SudoWorksOfficeHours", {
  description: "Unapplied Office Hours reference architecture: CloudFront, S3, API Gateway, Lambda, and DynamoDB.",
});
