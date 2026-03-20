
# Event Driven Workflow Engine

Purpose

Enable resilient automation and scalable processing across the platform.

Event Bus Options

Kafka
NATS
Redis Streams

Example Events

APPLICATION_SUBMITTED
DOCUMENT_VERIFIED
UNDERWRITING_APPROVED
LOAN_FUNDED
PAYMENT_RECEIVED

Workers subscribe to events and update platform state.
