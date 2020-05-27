"""Simple Pulumi program standing up an
EC2 VM serving a static file.
"""

import pulumi
from pulumi_aws import ec2

firewall = ec2.SecurityGroup('web-secgrp', ingress=[
    # SSH
    { "protocol": "tcp", "from_port": 22, "to_port": 22, "cidr_blocks": ["0.0.0.0/0"] },
    # HTTP
    { "protocol": "tcp", "from_port": 80, "to_port": 80, "cidr_blocks": ["0.0.0.0/0"] },
])

user_data = """#!/bin/bash
echo "Hello, World!" > index.html
nohup python -m SimpleHTTPServer 80 &
"""

server = ec2.Instance('web-server-www;',
    instance_type="t2.micro",
    security_groups=[ firewall.name ],
    tags={"Owner": "Chris"},
    # AMI for us-east-2 (Ohio)
    ami="ami-c55673a0",
    user_data=user_data)
