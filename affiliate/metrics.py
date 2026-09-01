from __future__ import annotations

from dataclasses import dataclass


def safe_ratio(numerator: float, denominator: float) -> float:
    return float(numerator) / float(denominator) if denominator else 0.0


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


@dataclass(frozen=True)
class AffiliateMetrics:
    clicks: int = 0
    orders: int = 0
    revenue: float = 0.0
    commission: float = 0.0
    ctr: float = 0.0
    conversion_rate: float = 0.0
    epc: float = 0.0

    @classmethod
    def build(
        cls,
        *,
        clicks: int = 0,
        orders: int = 0,
        revenue: float = 0.0,
        commission: float = 0.0,
        ctr: float = 0.0,
    ) -> "AffiliateMetrics":
        clicks = max(0, int(clicks))
        orders = max(0, int(orders))
        revenue = max(0.0, float(revenue))
        commission = max(0.0, float(commission))
        return cls(
            clicks=clicks,
            orders=orders,
            revenue=revenue,
            commission=commission,
            ctr=max(0.0, float(ctr)),
            conversion_rate=safe_ratio(orders, clicks),
            epc=safe_ratio(commission, clicks),
        )


def product_performance_score(
    *,
    conversion_rate: float,
    epc: float,
    commission_rate: float,
    clicks: int,
) -> float:
    """Return a conservative 0-100 score from monetization signals.

    Low-volume products receive a confidence penalty so one lucky order does not
    automatically dominate the selector.
    """
    cvr_points = clamp(conversion_rate / 0.08, 0.0, 1.0) * 40.0
    epc_points = clamp(epc / 5.0, 0.0, 1.0) * 35.0
    rate_points = clamp(commission_rate / 0.20, 0.0, 1.0) * 15.0
    confidence = clamp(clicks / 100.0, 0.25, 1.0)
    return round((cvr_points + epc_points + rate_points) * confidence + 10.0, 2)
