# INSIGHT-311 — NLP Mock Classifier Rules (Use Case 1)

**Purpose:** Provide a professor-safe, explainable prototype for classifying 311 caller transcripts into a service category with a confidence score.

This is a **rules + keyword** classifier (not ML training yet).  
It is designed to be:
- explainable
- auditable
- easy to extend

---

## 1) Input / Output

### Input
- `transcript_text` (string)

### Output
- `predicted_category` (string)
- `confidence_score` (0.00–1.00)
- `matched_terms` (list of keywords found)
- `explanation_snippet` (short summary)

---

## 2) Category Taxonomy (aligned with intake form)

1. Graffiti / Vandalism  
2. Pothole / Road Damage  
3. Missed / Delayed Garbage Pickup  
4. Recycling / Organics Collection Issue  
5. Bulk Item Pickup Issue  
6. Sidewalk Snow Clearing  
7. Sidewalk Trip Hazard  
8. Streetlight / Traffic Signal Issue  
9. Parking Complaint (Non-emergency)  
10. Property Standards Complaint  
11. Needles / Hazardous Waste  
12. Trail / Park Maintenance  
13. Fallen Tree / Branch  
14. Water Leak / Flooding  
15. Unknown / Needs Human Review  

---

## 3) Keyword Dictionary (prototype)

> Notes:
> - Matching is case-insensitive
> - “Exact match” is not required (basic contains match is enough)
> - Multiple categories may match; choose the highest scoring

### 3.1 Graffiti / Vandalism
Keywords: graffiti, vandal, vandalism, spray paint, tagging, tag on wall, deface

### 3.2 Pothole / Road Damage
Keywords: pothole, hole in road, road damage, broken asphalt, sinkhole, cracked road, big hole

### 3.3 Missed / Delayed Garbage Pickup
Keywords: garbage not picked, trash not picked, missed pickup, garbage pickup, bins still out, collection missed, waste not collected

### 3.4 Recycling / Organics Collection Issue
Keywords: recycling not picked, blue bin, green bin, organics, compost bin, recycling pickup, green cart

### 3.5 Bulk Item Pickup Issue
Keywords: bulk pickup, couch pickup, mattress pickup, furniture pickup, large item pickup, appliance pickup

### 3.6 Sidewalk Snow Clearing
Keywords: sidewalk snow, not cleared, snow not removed, icy sidewalk, snow on sidewalk, plow didn’t clear

### 3.7 Sidewalk Trip Hazard
Keywords: trip hazard, uneven sidewalk, broken sidewalk, lifted slab, cracked sidewalk, hole in sidewalk

### 3.8 Streetlight / Traffic Signal Issue
Keywords: streetlight out, light not working, traffic light broken, signal not working, flashing signal, lamp post out

### 3.9 Parking Complaint (Non-emergency)
Keywords: parked illegally, blocking driveway, parking complaint, car blocking, no parking, double parked

### 3.10 Property Standards Complaint
Keywords: overgrown grass, garbage on property, unsafe property, abandoned house, property complaint, pest issue, illegal dumping on property

### 3.11 Needles / Hazardous Waste
Keywords: needle, syringe, hazardous waste, biohazard, sharp object, medical waste

### 3.12 Trail / Park Maintenance
Keywords: park maintenance, trail maintenance, broken bench, garbage in park, playground issue, damaged swing

### 3.13 Fallen Tree / Branch
Keywords: fallen tree, tree down, branch down, blocking road, tree blocking, storm damage tree

### 3.14 Water Leak / Flooding
Keywords: water leak, flooding, burst pipe, water main, leak on street, standing water, basement flooding (non-emergency)

---

## 4) Confidence Scoring (simple and explainable)

### Rule
- Start with score = 0
- For each matched keyword:
  - add +0.18 (strong phrase, e.g., “garbage not picked”)
  - add +0.12 (single term, e.g., “pothole”)

### Normalize
- Cap at 0.95 max
- If only 1 weak match → cap at 0.70
- If no match → category = "Unknown / Needs Human Review", confidence = 0.40

### Tie-break
If two categories tie:
1) Prefer the category with the *longer phrase match*  
2) Otherwise choose "Unknown / Needs Human Review"

---

## 5) Example Outputs (for demos)

### Example A — High confidence
Transcript: "My garbage wasn’t picked up today. Bins still outside at 55 King Street."
Output:
- predicted_category: Missed / Delayed Garbage Pickup
- confidence_score: 0.86
- matched_terms: ["garbage wasn’t picked up", "bins still out"]
- explanation_snippet: Matched garbage collection keywords

### Example B — Low confidence / vague
Transcript: "My street is messy and unsafe."
Output:
- predicted_category: Unknown / Needs Human Review
- confidence_score: 0.45
- matched_terms: []
- explanation_snippet: No reliable keyword match
