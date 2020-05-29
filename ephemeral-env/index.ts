// Copyright 2016-2019, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";

import axios from "axios";

const config = new pulumi.Config();
const githubToken = config.require("githubToken");

// const hostedZone = config.get("hostedZone");   // e.g. pulumi.com
const domainName = config.require("domainName");  // e.g. issue-tracker.pulumi.com

// Provision an SSL certificate to enable SSL -- ensuring to do so in us-east-1.
const awsUsEast1 = new aws.Provider("usEast1", { region: "us-east-1" });
const sslCert = new aws.acm.Certificate("sslCert", {
    domainName: domainName,
    validationMethod: "DNS",
}, { provider: awsUsEast1 });

// gitHubIssueTracker is an API Gateway that both serves our static content, as well
// as proxying GitHub API calls.
const issueTrackerApiGateway = new awsx.apigateway.API(
    `issue-tracker_${pulumi.getStack()}`,
    {
        routes: [
            // Serve the static content at the root.
            {
                path: "/",
                localPath: "./site/",
            },
            // Also serve a GET-only proxy for sending requests to api.github.com with our credentials.
            // This is so we don't make the GitHub access token used publicly available.
            {
                path: "/github/{path+}",
                method: "GET",
                eventHandler: async (ev, ctx) => {
                    let url = ev.path.replace(/^\/github/, "https://api.github.com");
                    const queryParts = [];
                    // tslint:disable-next-line:forin
                    for (const key in ev.queryStringParameters) {
                        queryParts.push(`${key} = ${ev.queryStringParameters[key]}`);
                    }
                    const qs = queryParts.join("&");
                    if (qs.length > 0) {
                        url = url + "?" + qs;
                    }
                    try {
                        console.log(`getting ${url}`);
                        const res = await axios.get(url, {
                            responseType: "json",
                            transformResponse: resp => resp,
                            headers: { Authorization: `token ${githubToken}` },
                        });
                        console.log(
                            `got response: ${res.status} ${res.statusText} ${res.data.length}`
                        );
                        return {
                            statusCode: res.status,
                            headers: res.headers,
                            body: res.data + `got response: ${res.status} ${res.statusText} ${res.data.length}`,
                        };
                    } catch (e) {
                        console.log(`Error calling GitHub API "${url}": ${e}`);
                        return {
                            statusCode: e.response?.status || 500,
                            body: "Error issuing GitHub API request",
                        };
                    }
                },
            },
        ],
    }, {
    dependsOn: [
        // We cannot delete the ACM cert until it is no longer used, so
        // we need to delete the API Gateway first.
        sslCert,
    ]
});

// Split a domain name into its subdomain and parent domain names.
// e.g. "www.example.com" => "www", "example.com".
function getDomainAndSubdomain(domain: string): { subdomain: string, parentDomain: string } {
    const parts = domain.split(".");
    if (parts.length < 2) {
        throw new Error(`No TLD found on ${domain}`);
    }
    // No subdomain, e.g. awesome-website.com.
    if (parts.length === 2) {
        return { subdomain: "", parentDomain: domain };
    }

    const subdomain = parts[0];
    parts.shift();  // Drop first element.
    return {
        subdomain,
        // Trailing "." to canonicalize domain.
        parentDomain: parts.join(".") + ".",
    };
}

const domainParts = getDomainAndSubdomain(domainName);
const hostedZoneId = aws.route53.getZone({ name: domainParts.parentDomain }).then(zone => zone.zoneId);

// Create the necessary DNS records for ACM to validate ownership, and wait for it.
const sslCertValidationRecord = new aws.route53.Record("sslCertValidationRecord", {
    zoneId: hostedZoneId,
    name: sslCert.domainValidationOptions[0].resourceRecordName,
    type: sslCert.domainValidationOptions[0].resourceRecordType,
    records: [sslCert.domainValidationOptions[0].resourceRecordValue],
    ttl: 10 * 60 /* 10 minutes */,
});
const sslCertValidationIssued = new aws.acm.CertificateValidation("sslCertValidationIssued", {
    certificateArn: sslCert.arn,
    validationRecordFqdns: [sslCertValidationRecord.fqdn],
}, { provider: awsUsEast1 });


// Configure an edge-optimized domain for our API Gateway. This will configure a Cloudfront CDN
// distribution behind the scenes and serve our API Gateway at a custom domain name over SSL.
const webDomain = new aws.apigateway.DomainName("webCdn", {
    certificateArn: sslCertValidationIssued.certificateArn,
    domainName: domainName,
});
const webDomainMapping = new aws.apigateway.BasePathMapping("webDomainMapping", {
    restApi: issueTrackerApiGateway.restAPI,
    stageName: issueTrackerApiGateway.stage.stageName,
    domainName: webDomain.id,
});

// Finally create an A record for our domain that directs to our custom domain.
const webDnsRecord = new aws.route53.Record("webDnsRecord", {
    name: webDomain.domainName,
    type: "A",
    zoneId: hostedZoneId,
    aliases: [{
        evaluateTargetHealth: true,
        name: webDomain.cloudfrontDomainName,
        zoneId: webDomain.cloudfrontZoneId,
    }],
}, { dependsOn: sslCertValidationIssued });

export const apiGatewayUrl = issueTrackerApiGateway.url;
export const hostedDomain = `https://${domainName}/`;