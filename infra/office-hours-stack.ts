import { join } from "node:path";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  aws_apigateway as apigateway,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  aws_secretsmanager as secretsmanager,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

export class OfficeHoursStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const bookings = new dynamodb.Table(this, "Bookings", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: "expiresAtEpoch",
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const encryptionKey = new secretsmanager.Secret(this, "BookingEncryptionKey", {
      description: "Random key material used to derive the Office Hours contact encryption key.",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ purpose: "office-hours-contact-encryption" }),
        generateStringKey: "key",
        passwordLength: 64,
        excludePunctuation: true,
      },
    });
    encryptionKey.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const bookingFunction = new lambda.Function(this, "BookingFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "index.handler",
      code: lambda.Code.fromAsset(join(process.cwd(), "dist", "lambda")),
      description: "Office Hours API using the shared booking domain and DynamoDB adapter.",
      environment: {
        BOOKING_TABLE_NAME: bookings.tableName,
        BOOKING_KEY_SECRET_ARN: encryptionKey.secretArn,
        NODE_OPTIONS: "--enable-source-maps",
      },
      memorySize: 256,
      timeout: Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    bookingFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ["dynamodb:BatchGetItem", "dynamodb:GetItem", "dynamodb:TransactWriteItems"],
      resources: [bookings.tableArn],
    }));
    encryptionKey.grantRead(bookingFunction);
    bookingFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ["xray:PutTraceSegments", "xray:PutTelemetryRecords"],
      resources: ["*"],
    }));

    const apiAccessLogs = new logs.LogGroup(this, "ApiAccessLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const api = new apigateway.RestApi(this, "Api", {
      description: "Office Hours booking API",
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      cloudWatchRole: true,
      deployOptions: {
        stageName: "v1",
        accessLogDestination: new apigateway.LogGroupLogDestination(apiAccessLogs),
        accessLogFormat: apigateway.AccessLogFormat.custom(JSON.stringify({
          requestId: "$context.requestId",
          method: "$context.httpMethod",
          path: "$context.path",
          status: "$context.status",
          responseLength: "$context.responseLength",
          integrationLatency: "$context.integrationLatency",
          error: "$context.error.responseType",
        })),
        dataTraceEnabled: false,
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        metricsEnabled: true,
        tracingEnabled: true,
        throttlingBurstLimit: 10,
        throttlingRateLimit: 5,
      },
      defaultMethodOptions: {
        authorizationType: apigateway.AuthorizationType.NONE,
      },
    });
    const integration = new apigateway.LambdaIntegration(bookingFunction, { proxy: true });
    const apiRoot = api.root.addResource("api");
    const health = apiRoot.addResource("health");
    health.addResource("live").addMethod("GET", integration);
    health.addResource("ready").addMethod("GET", integration);
    apiRoot.addResource("slots").addMethod("GET", integration);
    apiRoot.addResource("engineering").addMethod("GET", integration);
    apiRoot.addResource("bookings").addMethod("POST", integration);

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: "default-src 'self'; base-uri 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
      customHeadersBehavior: {
        customHeaders: [
          { header: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()", override: true },
        ],
      },
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket as unknown as s3.IBucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: securityHeaders,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "api/*": {
          origin: new origins.HttpOrigin(
            `${api.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
            { originPath: `/${api.deploymentStage.stageName}`, protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY },
          ),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          compress: true,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: securityHeaders,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
    });

    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [s3deploy.Source.asset(join(process.cwd(), "dist", "public"))],
      destinationBucket: siteBucket as unknown as s3.IBucket,
      distribution,
      distributionPaths: ["/*"],
      prune: false,
    });

    bookingFunction.metricErrors({ period: Duration.minutes(5) }).createAlarm(this, "LambdaErrorsAlarm", {
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Office Hours Lambda returned an error; notification routing must be configured by the deployer.",
    });
    bookingFunction.metricThrottles({ period: Duration.minutes(5) }).createAlarm(this, "LambdaThrottlesAlarm", {
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Office Hours Lambda was throttled.",
    });
    api.metricServerError({ period: Duration.minutes(5) }).createAlarm(this, "Api5xxAlarm", {
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Office Hours API returned a 5xx response.",
    });

    new CfnOutput(this, "SiteUrl", { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, "ApiStageUrl", { value: api.url, description: "Direct API URL; the UI uses the CloudFront /api behavior." });
  }
}
