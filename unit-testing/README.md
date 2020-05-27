# Unit Testing Pulumi programs in Python

An example of writing mock-based unit tests with both infrastructure definition and tests written in Python. The example uses the [unittest](https://docs.python.org/3/library/unittest.html) test framework to define and run the tests.

## Running the tests

1. Create a Python virtualenv, activate it, and install dependencies:

   ```bash
   $ python3 -m venv venv
   $ source venv/bin/activate
   $ pip3 install -r requirements.txt
   ```

2.  Run the tests:

    ``` 
    $ python -m unittest

    ------------------------------------------------------------
    Ran 2 tests in 0.004s

    OK
    ```

## SSH to the VM

[Documentation](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-connect-methods.html#ec2-instance-connect-connecting-aws-cli)

```
# Create SSH key file.
SSH_KEY_FILE="/tmp/rsa_$(date +%s)"
ssh-keygen -N "" -m PEM -t rsa -f ${SSH_KEY_FILE}
chmod 400 ${SSH_KEY_FILE}

# Send key to EC2 VM
export AWS_REGION=$(pulumi config get aws:region)
aws ec2-instance-connect send-ssh-public-key \
    --instance-id $(pulumi stack output instanceID) \
    --availability-zone $(pulumi stack output availabilityZone) \
    --instance-os-user ec2-user \
    --ssh-public-key "file://${SSH_KEY_FILE}.pub"

# Connect to the VM
ssh \
    -S "~/.control-socket" -M \
    -i "${SSH_KEY_FILE}" \
    -o "IdentitiesOnly=yes" \
    -o "StrictHostKeyChecking=no" \
    -o "ExitOnForwardFailure=yes" \
    -v \
    "ec2-user@$(pulumi stack output publicDNS)"
```

## Further steps

Learn more about testing Pulumi programs:

- [Testing Guide](https://www.pulumi.com/docs/guides/testing/)
- [Unit Testing Guide](https://www.pulumi.com/docs/guides/testing/unit/)
