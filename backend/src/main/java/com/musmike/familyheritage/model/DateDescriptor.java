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

    @Column(name = "start_second")
    private Integer startSecond;

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

    @Column(name = "end_second")
    private Integer endSecond;

    private LocalDateTime sortDateTimeMin;
    private LocalDateTime sortDateTimeMax;

    public void recalculateSortDates() {
        if (dateType == DateType.FREE_TEXT || startYear == null) {
            this.sortDateTimeMin = null;
            this.sortDateTimeMax = null;
            return;
        }

        this.sortDateTimeMin = computePointMin(startYear, startMonth, startDay, startHour, startMinute, startSecond);

        if (dateType == DateType.RANGE && endYear != null) {
            this.sortDateTimeMax = computePointMax(endYear, endMonth, endDay, endHour, endMinute, endSecond);
        } else if (dateType == DateType.RANGE && endHour != null) {
            this.sortDateTimeMax = computePointMax(startYear, startMonth, startDay, endHour, endMinute, endSecond);
        } else {
            this.sortDateTimeMax = computePointMax(startYear, startMonth, startDay, startHour, startMinute, startSecond);
        }
    }

    public static LocalDateTime computePointMin(
            Integer y,
            Integer m,
            Integer d,
            Integer h,
            Integer min,
            Integer sec
    ) {
        if (y == null) {
            return null;
        }
        if (m != null && d != null) {
            int safeMonth = Math.clamp(m, 1, 12);
            int safeDay = Math.clamp(d, 1, YearMonth.of(y, safeMonth).lengthOfMonth());
            if (h != null) {
                int safeHour = Math.clamp(h, 0, 23);
                int safeMin = min != null ? Math.clamp(min, 0, 59) : 0;
                int safeSec = (min != null && sec != null) ? Math.clamp(sec, 0, 59) : 0;
                return LocalDateTime.of(y, safeMonth, safeDay, safeHour, safeMin, safeSec);
            }
            return LocalDateTime.of(y, safeMonth, safeDay, 0, 0);
        } else if (m != null) {
            int safeMonth = Math.clamp(m, 1, 12);
            return LocalDateTime.of(y, safeMonth, 1, 0, 0);
        } else {
            return LocalDateTime.of(y, 1, 1, 0, 0);
        }
    }

    public static LocalDateTime computePointMax(
            Integer y,
            Integer m,
            Integer d,
            Integer h,
            Integer min,
            Integer sec
    ) {
        if (y == null) {
            return null;
        }
        if (m != null && d != null) {
            int safeMonth = Math.clamp(m, 1, 12);
            int safeDay = Math.clamp(d, 1, YearMonth.of(y, safeMonth).lengthOfMonth());
            if (h != null) {
                int safeHour = Math.clamp(h, 0, 23);
                int safeMin = min != null ? Math.clamp(min, 0, 59) : 59;
                int safeSec = (min != null && sec != null) ? Math.clamp(sec, 0, 59) : 0;
                return LocalDateTime.of(y, safeMonth, safeDay, safeHour, safeMin, safeSec);
            }
            return LocalDateTime.of(y, safeMonth, safeDay, 23, 59);
        } else if (m != null) {
            int safeMonth = Math.clamp(m, 1, 12);
            int lastDay = YearMonth.of(y, safeMonth).lengthOfMonth();
            return LocalDateTime.of(y, safeMonth, lastDay, 23, 59);
        } else {
            return LocalDateTime.of(y, 12, 31, 23, 59);
        }
    }
}