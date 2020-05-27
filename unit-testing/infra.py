"""Simple Pulumi program standing up an
EC2 VM serving a static file.
"""

import pulumi
from pulumi_aws import ec2

# Writes an index.html file, then runs the built-in Python
# webserver module on port 80.
user_data = """#!/bin/bash
echo "Hello, World! From a Pulumi-managed EC2 server." > index.html
nohup python -m SimpleHTTPServer 80 &
"""

instance = ec2.Instance('web-server-www;',
    instance_type="t2.micro",
    tags={"Owner": "Chris"},
    # AMI for Amazon Linux 2 us-east-2 (Ohio)
    ami="ami-0f7919c33c90f5b58",
    user_data=user_data)

group = ec2.SecurityGroup('web-secgrp', ingress=[
    # SSH
    { "protocol": "tcp", "from_port": 22, "to_port": 22, "cidr_blocks": ["0.0.0.0/0"] },
    # HTTP
    { "protocol": "tcp", "from_port": 80, "to_port": 80, "cidr_blocks": ["0.0.0.0/0"] },
])

group_attachment = ec2.NetworkInterfaceSecurityGroupAttachment("web-secgrp-attchment",
    network_interface_id=instance.primary_network_interface_id,
    security_group_id=group.id)