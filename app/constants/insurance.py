"""보험 보장 태그 분류 — schemas/insurance.py의 `Coverage` Literal과 키를 맞춘다.

비례보상(실손형)은 같은 손해를 여러 계약이 나눠 보상하므로 중복 가입해도 더 받지 못한다. 정액형은 계약마다 따로
받으므로 겹침 자체는 문제가 아니고, 합계가 필요 이상인지(적정 가입금액 대비)를 본다."""

# 실손의료비, 일상생활배상책임, 운전자 벌금·형사합의·변호사비
INDEMNITY_COVERAGES: frozenset[str] = frozenset({"medical_indemnity", "liability", "driver_legal"})

# 부부가 설정에서 적정 가입금액 기준을 조정할 수 있는 정액 보장 — config.py의 `insurance_target_<coverage>`와 키를 맞춘다.
TARGETED_COVERAGES: tuple[str, ...] = ("cancer", "stroke", "heart", "hospitalization", "death", "disability")
