import io
import json
import unittest
from unittest.mock import patch

from api.predict import MAX_BODY_BYTES, handler


def make_handler(payload, authorization="Bearer valid"):
    body = json.dumps(payload).encode()
    instance = handler.__new__(handler)
    instance.headers = {
        "Authorization": authorization,
        "Content-Length": str(len(body)),
    }
    instance.rfile = io.BytesIO(body)
    captured = []
    instance._send_json = lambda status, data: captured.append((status, data))
    return instance, captured


class PredictApiSecurityTests(unittest.TestCase):
    def test_missing_token_is_rejected_before_body_processing(self):
        instance, captured = make_handler({}, authorization="")
        instance.do_POST()
        self.assertEqual(captured[0][0], 401)

    @patch("api.predict.verify_firebase_token", return_value={"uid": "u1", "role": "viewer"})
    def test_oversized_body_is_rejected(self, _verify):
        instance, captured = make_handler({})
        instance.headers["Content-Length"] = str(MAX_BODY_BYTES + 1)
        instance.do_POST()
        self.assertEqual(captured[0][0], 413)

    @patch("api.predict.verify_firebase_token", return_value={"uid": "u1", "role": "viewer"})
    def test_batch_item_limit_is_enforced(self, _verify):
        instance, captured = make_handler({
            "mode": "batch",
            "items": [{"id": str(index)} for index in range(501)],
            "transactions": [],
        })
        instance.do_POST()
        self.assertEqual(captured[0][0], 400)

    @patch("api.predict.verify_firebase_token", return_value={"uid": "u1", "role": "viewer"})
    def test_horizon_limit_is_enforced(self, _verify):
        instance, captured = make_handler({
            "transactions": [{}, {}],
            "currentQuantity": 10,
            "horizonDays": 91,
        })
        instance.do_POST()
        self.assertEqual(captured[0][0], 400)


if __name__ == "__main__":
    unittest.main()
