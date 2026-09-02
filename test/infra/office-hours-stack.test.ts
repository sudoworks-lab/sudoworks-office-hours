import assert from "node:assert/strict";
import { test } from "node:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { OfficeHoursStack } from "../../infra/office-hours-stack.ts";

test("CDK stack contains the guarded booking write path and observable edge", () => {
  const app = new App();
  const stack = new OfficeHoursStack(app, "TestOfficeHours");
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::DynamoDB::Table", {
    BillingMode: "PAY_PER_REQUEST",
    DeletionProtectionEnabled: true,
    KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
    PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    TimeToLiveSpecification: { AttributeName: "expiresAtEpoch", Enabled: true },
  });
  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: "nodejs22.x",
    TracingConfig: { Mode: "Active" },
    Environment: { Variables: Match.objectLike({ BOOKING_TABLE_NAME: Match.anyValue(), BOOKING_KEY_SECRET_ARN: Match.anyValue() }) },
  });
  template.resourceCountIs("AWS::ApiGateway::RestApi", 1);
  template.resourceCountIs("AWS::CloudFront::Distribution", 1);
  template.resourceCountIs("AWS::CloudWatch::Alarm", 3);
  template.resourceCountIs("AWS::SecretsManager::Secret", 1);
  template.resourceCountIs("AWS::S3::Bucket", 1);

  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: ["dynamodb:BatchGetItem", "dynamodb:GetItem", "dynamodb:TransactWriteItems"],
          Effect: "Allow",
        }),
      ]),
    },
  });

  const json = template.toJSON();
  assert.ok(JSON.stringify(json).includes("attribute_not_exists") === false, "Conditional expressions belong to Lambda code, not the infrastructure template.");
});
