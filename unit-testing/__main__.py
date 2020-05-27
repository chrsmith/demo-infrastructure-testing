import pulumi

import infra

pulumi.export("instanceID", infra.instance.id)
pulumi.export("publicDNS", infra.instance.public_dns)
pulumi.export("publicIP", infra.instance.public_ip)
pulumi.export("availabilityZone", infra.instance.availability_zone)