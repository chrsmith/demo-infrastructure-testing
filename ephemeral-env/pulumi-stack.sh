#!/bin/bash

STACK_NAME=$1

TEST_STACK=$(pulumi stack select --stack $STACK_NAME 2>&1)
NO_STACK="error: no stack named"

if [[ "$TEST_STACK" == *"$NO_STACK"* ]]; then
    echo "pulumi creating new stack $STACK_NAME"
    pulumi stack init --stack $STACK_NAME
    pulumi stack ls
fi
