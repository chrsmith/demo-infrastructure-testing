"""Simple Pulumi program standing up an
EC2 VM serving a static file.
"""

import pulumi

# Import the infrastructure module, which will create all of the
# cloud resources.
import infra

# "export" values from the Pulumi Stack, making them easier to
# access from other tools.
pulumi.export("instanceID", infra.instance.id)
pulumi.export("publicDNS", infra.instance.public_dns)
pulumi.export("publicIP", infra.instance.public_ip)
pulumi.export("availabilityZone", infra.instance.availability_zone)
