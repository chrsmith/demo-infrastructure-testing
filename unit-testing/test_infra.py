"""Unit tests for the infra
"""

import unittest
import pulumi

# Mock out the Pulumi runtime engine, so that rather than creating or updating
# cloud resources, we will instead make resources available for testing.
class MyMocks(pulumi.runtime.Mocks):
    def new_resource(self, type_, name, inputs, provider, id_):
        return [name + '_id', inputs]
    def call(self, token, args, provider):
        return {}

pulumi.runtime.set_mocks(MyMocks())

# Import the module to test.
import infra

class InfrastructureTests(unittest.TestCase):
    # Verify that the EC2 instance has the expected tags defined.
    @pulumi.runtime.test
    def test_server_tags(self):
        def check_tags(args):
            urn, tags = args
            self.assertIsNotNone(tags, f"EC2 instance {urn} must have tags")
            self.assertIn('Owner', tags, f"EC2 instance {urn} must have an 'Owner' tag")

        return pulumi.Output \
            .all(infra.instance.urn, infra.instance.tags) \
            .apply(check_tags)

    # Verify firewall rules are expected.
    @pulumi.runtime.test
    def test_security_group_rules(self):
        def check_security_group_rules(args):
            urn, ingress = args
            for rule in ingress:
                if rule["from_port"] not in [ 80 ]:
                    self.assertFalse(f"Security group {urn} opens unexpected port: {rule}")

        return pulumi.Output \
            .all(infra.group.urn, infra.group.ingress) \
            .apply(check_security_group_rules)
