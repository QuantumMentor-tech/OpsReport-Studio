# OpsReport Studio — Station Configuration Data Contract

**Document Identifier:** CTR-STN-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 3 of 45 (Station Sequence, Ordering & Configuration Specification)  
**Status:** Authoritative Conceptual Contract  
**Last Updated:** 2026-10-19  

---

## 1. Contract Overview & Architectural Purpose

This document specifies the conceptual data contract for the Station and Station Sequence domain in OpsReport Studio. 

> [!IMPORTANT]
> **Architectural Boundary Notice:** This document establishes a **conceptual and logical data contract**. It defines data entities, invariants, relationships, and validation boundaries. It is **NOT** a physical SQL schema, ORM entity declaration, database migration, or REST API specification. Physical database structures will be designed in later architectural phases.

---

## 2. Conceptual Station Entity Contract

The following properties define an individual station node within the operational inventory:

| Property Name | Logical Data Type | Requiredness | Property Classification | Architectural Purpose & Invariants |
| :--- | :--- | :--- | :--- | :--- |
| **`station_id`** | `String` / `UUID` | **Mandatory** | `[ANALYST-PROPOSED]` | Immutable internal system identifier. Decouples the physical station identity from UI renames, preventing broken report references. |
| **`station_name`** | `String` (1..150 chars) | **Mandatory** | `[USER-CONFIRMED]` | Official human-readable station name as provided by user/operations. Must be non-empty and case-insensitively unique within the active sequence. |
| **`sequence_order`** | `Integer` (1..N) | **Mandatory** | `[USER-CONFIRMED]` | Explicit 1-based ordinal position of the station within the authoritative operational route. Strictly contiguous and unique. |
| **`station_code`** | `String` (2..10 chars) | **Optional** | `[RESEARCH-SUGGESTED]` | Operational shortcode or telegraphic code (e.g., `ST-01`, `GCT`), if used by the facility. Nullable if the customer does not use codes. |
| **`is_active`** | `Boolean` | **Mandatory** | `[ANALYST-PROPOSED]` | Lifecycle flag indicating whether the station is currently in active operational service (`true`) or decommissioned/temporarily closed (`false`). |
| **`route_tag`** | `String` | **Optional** | `[ANALYST-PROPOSED]` | Extensibility marker designating zone, sector, or line membership (e.g., `MainLine`, `SectorA`). Defaults to `DefaultRoute`. |
| **`remarks`** | `String` | **Optional** | `[ANALYST-PROPOSED]` | Administrative notes regarding station operational access, platform lengths, or facility contacts. |

---

## 3. Conceptual Station Sequence Collection Contract

A station sequence represents the complete, validated operational path:

| Property Name | Logical Data Type | Requiredness | Property Classification | Architectural Purpose & Invariants |
| :--- | :--- | :--- | :--- | :--- |
| **`sequence_id`** | `String` / `UUID` | **Mandatory** | `[ANALYST-PROPOSED]` | Unique identifier for the sequence definition. |
| **`sequence_version`** | `Integer` | **Mandatory** | `[ANALYST-PROPOSED]` | Incrementing revision integer (e.g., `1, 2, 3...`) tracking configuration update events. |
| **`sequence_name`** | `String` | **Mandatory** | `[ANALYST-PROPOSED]` | Descriptive label (e.g., `Primary Operational Line Sequence`). |
| **`stations`** | `Array<StationEntity>` | **Mandatory** | `[USER-CONFIRMED]` | Ordered collection of station entities. The array index must strictly mirror the `sequence_order` of each child element. |
| **`station_count`** | `Integer` | **Mandatory** | `[ANALYST-PROPOSED]` | Derived total active station count (`count == stations.length >= 1`). |
| **`effective_date`** | `DateTime` (ISO 8601) | **Mandatory** | `[ANALYST-PROPOSED]` | Timestamp when this sequence configuration was activated. |
| **`checksum`** | `String` (SHA-256) | **Mandatory** | `[ANALYST-PROPOSED]` | Cryptographic hash computed over canonical station names and order. Used for quick integrity verification. |

---

## 4. Contract Invariants & Integrity Constraints

1. **Contiguous Ordinality Invariant:**
   For any active sequence with `N` stations, the set of `sequence_order` values must equal `{1, 2, ..., N}` exactly. There shall be no gaps, duplicates, or negative values.
2. **Deterministic Sequence Identity Invariant:**
   Given any two station entities `A` and `B` where `A.sequence_order < B.sequence_order`, `A` must appear before `B` in all UI audit views and all generated multi-station document rows.
3. **No Phantom Stations Invariant:**
   Every station referenced in an inspection report or draft session must resolve to a valid station in the sequence snapshot active at the time of session initialization.
4. **Name Uniqueness Invariant:**
   `Trim(LowerCase(A.station_name)) != Trim(LowerCase(B.station_name))` for all `A != B` within the same active sequence.

---

## 5. Conceptual JSON Representation (Illustrative Serialization)

The following structure illustrates how the station sequence contract may be serialized in internal configuration vaults or memory caches:

```json
{
  "sequence_id": "seq-primary-mainline",
  "sequence_version": 1,
  "sequence_name": "Authoritative Operational Station Sequence",
  "effective_date": "2026-10-19T00:00:00Z",
  "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "station_count": 0,
  "stations": [
    {
      "station_id": "stn-placeholder-id-only",
      "station_name": "PENDING_USER_PROVIDED_STATION_NAME",
      "sequence_order": 1,
      "station_code": null,
      "is_active": true,
      "route_tag": "DefaultRoute",
      "remarks": "Awaiting official station list from user"
    }
  ]
}
```

*Note: The item above is strictly illustrative of structural properties. No real station names or codes have been invented.*

---

## 6. Contract Classification Summary

* **CONFIRMED PROPERTIES:** `station_name`, `sequence_order`, ordered collection preservation, and non-empty station sequence.
* **ANALYST-PROPOSED PROPERTIES:** `station_id` (stable UUID), `sequence_version`, `checksum`, `is_active`, `route_tag`.
* **RESEARCH-SUGGESTED PROPERTIES:** `station_code`.
