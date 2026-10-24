package com.musmike.familyheritage.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "event_attribute_values", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"event_id", "attribute_dictionary_value_id"})
})
@Getter
@Setter
@NoArgsConstructor
public class EventAttributeValue {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "event_id", nullable = false)
    private Event event;

    @ManyToOne
    @JoinColumn(name = "attribute_dictionary_value_id", nullable = false)
    private AttributeDictionaryValue attributeDictionaryValue;
}