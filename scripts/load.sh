#!/usr/bin/env bash

APP_URL="${1:-http://localhost:3000}"

echo "Sending invoices to $APP_URL. Press Ctrl+C to stop."

while true; do
	curl --silent --show-error \
		--connect-timeout 5 \
		--max-time 30 \
		--cookie "user_email=load-generator@example.com" \
		--data-urlencode "companyName=Load Generator" \
		--data-urlencode "companyDetails=AWS metrics workload" \
		--data-urlencode "customerName=Metrics Customer" \
		--data-urlencode "customerDetails=Generated request" \
		--data-urlencode "taxRate=10" \
		--data-urlencode "expenses[0][description]=Deployment workshop" \
		--data-urlencode "expenses[0][cost]=100" \
		--data-urlencode "skipEmail=true" \
		"$APP_URL/generate"
	echo
	sleep "$((RANDOM % 10 + 1))"
done
