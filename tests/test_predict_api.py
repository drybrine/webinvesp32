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

    @patch("api.predict.verify_firebase_token", return_value={"uid": "u1", "role": "viewer"})
    def test_batch_skips_malformed_rows(self, _verify):
        instance, captured = make_handler({
            "mode": "batch",
            "items": [
                {"id": "bad", "barcode": "BAD", "name": "Bad", "quantity": "x", "minStock": 1},
                {"id": "ok", "barcode": "OK", "name": "Ok", "quantity": 10, "minStock": 1},
            ],
            "transactions": [
                {"productBarcode": "OK", "timestamp": "not-a-number", "quantity": 1, "type": "out"},
                {"productBarcode": "OK", "timestamp": 1_700_000_000_000, "quantity": 1, "type": "out"},
                {"productBarcode": "OK", "timestamp": 1_700_086_400_000, "quantity": 1, "type": "out"},
            ],
            "recentDays": 3650,
        })
        instance.do_POST()
        self.assertEqual(captured[0][0], 200)
        self.assertIn("risks", captured[0][1])

    @patch("api.predict.verify_firebase_token", return_value={"uid": "u1", "role": "viewer"})
    @patch("api.predict.predict_stock", side_effect=RuntimeError("secret path /tmp/private"))
    def test_generic_500_masks_exception_text(self, _predict, _verify):
        instance, captured = make_handler({
            "transactions": [
                {"timestamp": 1_700_000_000_000, "quantity": 1, "type": "out"},
                {"timestamp": 1_700_086_400_000, "quantity": 1, "type": "out"},
            ],
            "currentQuantity": 10,
        })
        instance.do_POST()
        self.assertEqual(captured[0][0], 500)
        self.assertNotIn("secret", captured[0][1]["error"])


if __name__ == "__main__":
    unittest.main()
