package com.musmike.familyheritage.model;

import com.musmike.familyheritage.model.enums.DateQualifier;
import com.musmike.familyheritage.model.enums.DateType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.LocalDateTime;

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
    @Column(length = 50)
    private DateQualifier endQualifier;

    private Integer endYear;
    private Integer endMonth;
    private Integer endDay;


    private LocalDateTime sortDateTimeMin;
    private LocalDateTime sortDateTimeMax;
}