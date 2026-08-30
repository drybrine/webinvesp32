import io
import json
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from api.predict import (
    MAX_BODY_BYTES,
    MS_PER_DAY,
    build_daily_series,
    build_consumption_series,
    handler,
    predict_stock,
)


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


class PredictionModelTests(unittest.TestCase):
    def _stock_series_from_out(self, day_offsets, quantity_per_day, current_qty):
        """Bangun deret stok dari konsumsi out harian yang menurun."""
        transactions = []
        for i, offset in enumerate(day_offsets):
            transactions.append({
                "timestamp": 1_700_000_000_000 + offset * MS_PER_DAY,
                "quantity": quantity_per_day[i],
                "type": "out",
            })
        return build_daily_series(transactions, current_qty)

    def test_empty_stock_date_matches_first_forecast_point(self):
        series = self._stock_series_from_out(list(range(10, 0, -1)), [2] * 10, 0)

        result = predict_stock(series, horizon_days=2, train_ratio=0.8)

        first_forecast_date = result["forecast"][0]["timestamp"]
        last_ts = series[-1]["timestamp"]
        self.assertEqual(first_forecast_date, last_ts + MS_PER_DAY)
        self.assertIsNotNone(result["stockoutDate"])

    def test_constant_consumption_gives_high_r2(self):
        series = self._stock_series_from_out(list(range(30, 0, -1)), [2] * 30, 40)

        result = predict_stock(series, horizon_days=10, train_ratio=0.85)

        self.assertGreater(result["metrics"]["r2"], 0.9)
        self.assertAlmostEqual(result["model"]["avgDailyConsumption"], 2.0, places=6)

    def test_model_reports_notebook_fields(self):
        series = self._stock_series_from_out(list(range(20, 0, -1)), [3] * 20, 40)

        result = predict_stock(series, horizon_days=5, train_ratio=0.85)

        self.assertIn("consumptionIntercept", result["model"])
        self.assertIn("consumptionSlope", result["model"])
        self.assertIn("lastConsumption", result["model"])
        self.assertIn("mape", result["metrics"])
        self.assertTrue(result["metrics"]["available"])

    def test_forecast_never_negative_and_dimension_correct(self):
        series = self._stock_series_from_out(list(range(15, 0, -1)), [4] * 15, 3)

        result = predict_stock(series, horizon_days=14, train_ratio=0.8)

        self.assertEqual(len(result["forecast"]), 14)
        self.assertTrue(all(f["predictedQuantity"] >= 0 for f in result["forecast"]))


if __name__ == "__main__":
    unittest.main()
