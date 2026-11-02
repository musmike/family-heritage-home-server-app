package com.musmike.familyheritage.model;

import com.musmike.familyheritage.model.enums.DateQualifier;
import com.musmike.familyheritage.model.enums.DateType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.time.YearMonth;

@Entity
@Table(name = "date_descriptors")
@Getter
@Setter
@NoArgsConstructor
public class DateDescriptor {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private DateType dateType;

    private String freeText;

    @Enumerated(EnumType.STRING)
    @Column(length = 50)
    private DateQualifier startQualifier;

    private Integer startYear;
    private Integer startMonth;
    private Integer startDay;

    @Enumerated(EnumType.STRING)
    @Column(name = "start_time_qualifier", length = 50)
    private DateQualifier startTimeQualifier;

    @Column(name = "start_hour")
    private Integer startHour;

    @Column(name = "start_minute")
    private Integer startMinute;

    @Enumerated(EnumType.STRING)
    @Column(length = 50)
    private DateQualifier endQualifier;

    private Integer endYear;
    private Integer endMonth;
    private Integer endDay;

    @Enumerated(EnumType.STRING)
    @Column(name = "end_time_qualifier", length = 50)
    private DateQualifier endTimeQualifier;

    @Column(name = "end_hour")
    private Integer endHour;

    @Column(name = "end_minute")
    private Integer endMinute;

    private LocalDateTime sortDateTimeMin;
    private LocalDateTime sortDateTimeMax;

    public void recalculateSortDates() {
        if (dateType == DateType.FREE_TEXT || startYear == null) {
            this.sortDateTimeMin = null;
            this.sortDateTimeMax = null;
            return;
        }

        this.sortDateTimeMin = computePointMin(startYear, startMonth, startDay, startHour, startMinute);

        if (dateType == DateType.RANGE && endYear != null) {
            this.sortDateTimeMax = computePointMax(endYear, endMonth, endDay, endHour, endMinute);
        } else {
            this.sortDateTimeMax = computePointMax(startYear, startMonth, startDay, startHour, startMinute);
        }
    }

    private LocalDateTime computePointMin(Integer y, Integer m, Integer d, Integer h, Integer min) {
        if (m != null && d != null) {
            int safeDay = Math.min(d, YearMonth.of(y, m).lengthOfMonth());
            if (h != null) {
                int safeHour = Math.clamp(h, 0, 23);
                int safeMin = min != null ? Math.clamp(min, 0, 59) : 0;
                return LocalDateTime.of(y, m, safeDay, safeHour, safeMin);
            }
            return LocalDateTime.of(y, m, safeDay, 0, 0);
        } else if (m != null) {
            return LocalDateTime.of(y, m, 1, 0, 0);
        } else {
            return LocalDateTime.of(y, 1, 1, 0, 0);
        }
    }

    private LocalDateTime computePointMax(Integer y, Integer m, Integer d, Integer h, Integer min) {
        if (m != null && d != null) {
            int safeDay = Math.min(d, YearMonth.of(y, m).lengthOfMonth());
            if (h != null) {
                int safeHour = Math.clamp(h, 0, 23);
                int safeMin = min != null ? Math.clamp(min, 0, 59) : 59;
                return LocalDateTime.of(y, m, safeDay, safeHour, safeMin);
            }
            return LocalDateTime.of(y, m, safeDay, 23, 59);
        } else if (m != null) {
            int lastDay = YearMonth.of(y, m).lengthOfMonth();
            return LocalDateTime.of(y, m, lastDay, 23, 59);
        } else {
            return LocalDateTime.of(y, 12, 31, 23, 59);
        }
    }
}